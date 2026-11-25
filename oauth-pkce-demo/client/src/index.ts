import express, { type NextFunction, type Request, type Response } from 'express';
import { decodeJwt } from 'jose';
import { CLIENT_ID, IDP_URL, PORT, REDIRECT_URI, SCOPE } from './config.js';
import { OAuthError, discover, tokenRequest, verifyIdToken, type TokenResponse } from './oidc.js';
import { codeChallengeS256, generateCodeVerifier, randomToken, safeEqual } from './pkce.js';
import { addStep, destroySession, getSession, type Session } from './session.js';
import { errorPage, homePage } from './views.js';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
const redact = (t: string) => (t.length > 40 ? `${t.slice(0, 20)}…(${t.length} chars)` : t);

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' });
  next();
});

function storeTokens(s: Session, tok: TokenResponse) {
  s.tokens = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? s.tokens?.refreshToken,
    idToken: tok.id_token ?? s.tokens?.idToken,
    expiresAt: Date.now() + tok.expires_in * 1000,
    scope: tok.scope ?? s.tokens?.scope ?? '',
  };
}

/** Use the refresh token (rotated by the IdP) when the access token is (nearly) expired. */
async function ensureFreshTokens(s: Session, force = false): Promise<void> {
  const t = s.tokens;
  if (!t) throw new OAuthError(401, 'not_authenticated', 'No session');
  if (!force && t.expiresAt - Date.now() > 10_000) return;
  if (!t.refreshToken) throw new OAuthError(401, 'session_expired', 'Access token expired and no refresh token');

  addStep(s, 'client', 'Access token expired/near expiry → refresh_token grant (back channel)',
    `POST ${IDP_URL}/token\ngrant_type=refresh_token\nrefresh_token=${redact(t.refreshToken)}\nclient_id=${CLIENT_ID}`);
  try {
    const tok = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: CLIENT_ID });
    storeTokens(s, tok);
    addStep(s, 'idp', 'New access token + rotated refresh token issued',
      `access_token=${redact(tok.access_token)}\nrefresh_token=${tok.refresh_token ? redact(tok.refresh_token) : '(none)'}\nexpires_in=${tok.expires_in}`);
  } catch (e) {
    s.tokens = undefined;
    s.user = undefined;
    throw new OAuthError(401, 'session_expired', e instanceof Error ? e.message : 'Refresh failed');
  }
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */
app.get('/', (req, res) => {
  const s = getSession(req, res);
  const notice = s.notice;
  s.notice = undefined;
  let idClaims: Record<string, unknown> | undefined;
  let accessClaims: Record<string, unknown> | undefined;
  try {
    if (s.tokens?.idToken) idClaims = decodeJwt(s.tokens.idToken);
    if (s.tokens?.accessToken) accessClaims = decodeJwt(s.tokens.accessToken);
  } catch { /* ignore display errors */ }
  res.send(homePage({ session: { ...s, notice }, idpUrl: IDP_URL, idClaims, accessClaims }));
});

/* ------------------------------------------------------------------ */
/* Step 1: build the authorization request with PKCE                   */
/* ------------------------------------------------------------------ */
app.get('/login', wrap(async (req, res) => {
  const s = getSession(req, res);
  const { meta } = await discover();

  s.flow = [];
  s.notice = undefined;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeS256(codeVerifier);
  const state = randomToken();
  const nonce = randomToken();
  s.pending = { state, nonce, codeVerifier };

  addStep(s, 'client', 'Generate PKCE pair + state + nonce',
    `code_verifier  = ${codeVerifier}   (secret, kept server-side, sent later in step 4)\n` +
    `code_challenge = BASE64URL(SHA256(code_verifier))\n               = ${codeChallenge}   (safe to send now)\n` +
    `state          = ${state}\nnonce          = ${nonce}`);

  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  addStep(s, 'browser', 'Redirect user to the IdP /authorize endpoint (front channel)',
    url.toString().replace(/&/g, '\n  &').replace('?', '\n  ?'));
  res.redirect(url.toString());
}));

/* ------------------------------------------------------------------ */
/* Steps 3-5: handle the redirect back, exchange code (+verifier)      */
/* ------------------------------------------------------------------ */
app.get('/callback', wrap(async (req, res) => {
  const s = getSession(req, res);
  const { meta } = await discover();

  const pending = s.pending;
  s.pending = undefined; // login attempt is single-use

  const fail = (status: number, msg: string) => {
    addStep(s, 'client', `Login failed: ${msg}`);
    s.notice = msg;
    return res.status(status).send(errorPage(msg));
  };

  const error = str(req.query.error);
  if (error) {
    s.notice = `Login was not completed: ${error}`;
    addStep(s, 'idp', `IdP returned an error: ${error}`, str(req.query.error_description));
    return res.redirect('/');
  }

  const code = str(req.query.code);
  const state = str(req.query.state);
  if (!pending) return fail(400, 'No login in progress (session expired or callback replayed).');
  if (!code || !state) return fail(400, 'Missing code or state.');

  // CSRF protection: the state must be exactly the one we generated for this browser session.
  if (!safeEqual(state, pending.state)) return fail(400, 'State mismatch (possible CSRF). Request rejected.');
  // RFC 9207: make sure the response comes from the IdP we started with (mix-up attack defence).
  const iss = str(req.query.iss);
  if (iss && iss !== meta.issuer) return fail(400, 'Issuer mismatch in authorization response.');

  addStep(s, 'browser', 'IdP redirected back to /callback with code + state',
    `code  = ${redact(code)}\nstate = ${state}  ✔ matches the value we stored`);

  const params = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: pending.codeVerifier,
  };
  addStep(s, 'client', 'Exchange code for tokens (back channel, server-to-server)',
    `POST ${meta.token_endpoint}\n` + Object.entries(params).map(([k, v]) => `${k}=${k === 'code' ? redact(v) : v}`).join('\n'));

  let tok: TokenResponse;
  try {
    tok = await tokenRequest(params);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : 'Token request failed');
  }
  addStep(s, 'idp', 'PKCE verified (SHA256(verifier) == challenge) → tokens issued',
    `token_type=${tok.token_type}\nexpires_in=${tok.expires_in}\nscope=${tok.scope}\n` +
    `access_token=${redact(tok.access_token)}\nid_token=${tok.id_token ? redact(tok.id_token) : '(none)'}\n` +
    `refresh_token=${tok.refresh_token ? redact(tok.refresh_token) : '(none)'}`);

  if (!tok.id_token) return fail(502, 'IdP did not return an ID token.');
  let claims;
  try {
    claims = await verifyIdToken(tok.id_token, pending.nonce);
  } catch (e) {
    return fail(502, `ID token validation failed: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
  addStep(s, 'client', 'Validated ID token (signature via JWKS, iss, aud, exp, nonce)', JSON.stringify(claims, null, 2));

  storeTokens(s, tok);
  s.user = { sub: String(claims.sub), name: claims.name as string | undefined, email: claims.email as string | undefined };
  res.redirect('/');
}));

/* ------------------------------------------------------------------ */
/* Calling a protected resource with the access token                  */
/* ------------------------------------------------------------------ */
app.get('/api/me', wrap(async (req, res) => {
  const s = getSession(req, res);
  try {
    await ensureFreshTokens(s);
  } catch (e) {
    const err = e as OAuthError;
    return res.status(err.status ?? 401).json({ error: err.code ?? 'unauthorized', message: err.message });
  }
  const { meta } = await discover();
  addStep(s, 'client', 'Call userinfo with Bearer access token', `GET ${meta.userinfo_endpoint}\nAuthorization: Bearer ${redact(s.tokens!.accessToken)}`);
  const r = await fetch(meta.userinfo_endpoint, { headers: { Authorization: `Bearer ${s.tokens!.accessToken}` } });
  const body = await r.json();
  addStep(s, 'idp', `userinfo → HTTP ${r.status}`, JSON.stringify(body, null, 2));
  res.status(r.status).json({ ...body, access_token_expires_in: Math.round((s.tokens!.expiresAt - Date.now()) / 1000) });
}));

app.post('/refresh', wrap(async (req, res) => {
  const s = getSession(req, res);
  try {
    await ensureFreshTokens(s, true);
  } catch (e) {
    s.notice = e instanceof Error ? e.message : 'Refresh failed';
  }
  res.redirect('/');
}));

app.post('/logout', (req, res) => {
  destroySession(req, res);
  res.redirect('/');
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send(errorPage(err.message));
});

app.listen(PORT, () => {
  console.log(`\x1b[36m[client]\x1b[0m Demo client listening on http://localhost:${PORT}`);
  console.log(`\x1b[36m[client]\x1b[0m Identity Provider expected at ${IDP_URL}`);
});
