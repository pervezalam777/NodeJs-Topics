import express, { type Request, type Response } from 'express';
import {
  ACCESS_TOKEN_TTL, ALLOWED_SCOPES, API_AUDIENCE, CODE_TTL, ISSUER, PORT, REFRESH_TOKEN_TTL,
  clients, users, type User,
} from './config.js';
import { publicJwk, signJwt, verifyAccessToken } from './keys.js';
import { isValidChallenge, isValidVerifier, randomToken, verifyPkce } from './pkce.js';
import { AUTH_REQUEST_TTL_MS, authCodes, authRequests, refreshTokens } from './store.js';
import { consentPage, errorPage, loginPage } from './views.js';

const log = (m: string) => console.log(`\x1b[35m[idp]\x1b[0m ${m}`);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: express.NextFunction) =>
    fn(req, res).catch(next);

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  next();
});

/* ------------------------------------------------------------------ */
/* Discovery + keys                                                    */
/* ------------------------------------------------------------------ */
app.get('/.well-known/openid-configuration', (_req, res) => {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ALLOWED_SCOPES,
    id_token_signing_alg_values_supported: ['RS256'],
    subject_types_supported: ['public'],
    authorization_response_iss_parameter_supported: true,
  });
});

app.get('/.well-known/jwks.json', (_req, res) => {
  res.json({ keys: [publicJwk] });
});

/* ------------------------------------------------------------------ */
/* Step 1: /authorize  (front channel, runs in the user's browser)     */
/* ------------------------------------------------------------------ */
app.get('/authorize', (req, res) => {
  const q = req.query;
  const client = clients.get(str(q.client_id) ?? '');
  if (!client) return res.status(400).send(errorPage('Unknown client_id.'));

  // redirect_uri must EXACTLY match a registered URI. Never redirect to an unverified URI.
  const redirectUri = str(q.redirect_uri);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return res.status(400).send(errorPage('redirect_uri is missing or not registered for this client.'));
  }

  const state = str(q.state);
  const fail = (error: string, description: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set('error', error);
    u.searchParams.set('error_description', description);
    if (state) u.searchParams.set('state', state);
    u.searchParams.set('iss', ISSUER);
    log(`/authorize rejected: ${error} (${description})`);
    return res.redirect(u.toString());
  };

  if (str(q.response_type) !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');

  // PKCE is mandatory for every client on this server.
  const codeChallenge = str(q.code_challenge);
  if (!codeChallenge) return fail('invalid_request', 'code_challenge is required (PKCE).');
  if (str(q.code_challenge_method) !== 'S256') return fail('invalid_request', 'code_challenge_method must be S256.');
  if (!isValidChallenge(codeChallenge)) return fail('invalid_request', 'Malformed code_challenge.');

  const requested = (str(q.scope) ?? 'openid profile').split(' ').filter(Boolean);
  const scope = [...new Set(requested.filter((s) => ALLOWED_SCOPES.includes(s)))].join(' ');
  if (!scope) return fail('invalid_scope', 'No valid scope requested.');

  const id = randomToken(24);
  authRequests.set(id, {
    id, clientId: client.id, redirectUri, scope, state, nonce: str(q.nonce), codeChallenge, createdAt: Date.now(),
  });
  log(`/authorize OK  client=${client.id} scope="${scope}" code_challenge=${codeChallenge.slice(0, 10)}…`);
  res.send(loginPage({ client, requestId: id }));
});

function getAuthRequest(id: string | undefined) {
  const ar = id ? authRequests.get(id) : undefined;
  if (!ar || Date.now() - ar.createdAt > AUTH_REQUEST_TTL_MS) return undefined;
  return ar;
}

/* Login + consent (still front channel) */
app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const ar = getAuthRequest(str(req.body.request_id));
  if (!ar) return res.status(400).send(errorPage('Authorization request expired. Start again from the app.'));
  const client = clients.get(ar.clientId)!;

  const user = users.find((u) => u.username === req.body.username && u.password === req.body.password);
  if (!user) {
    log(`login failed for "${String(req.body.username).slice(0, 40)}"`);
    return res.status(401).send(loginPage({ client, requestId: ar.id, error: 'Invalid username or password.' }));
  }
  ar.userId = user.id;
  log(`login OK user=${user.username}`);
  res.send(consentPage({ client, requestId: ar.id, scope: ar.scope, userName: user.name }));
});

app.post('/consent', express.urlencoded({ extended: false }), (req, res) => {
  const ar = getAuthRequest(str(req.body.request_id));
  if (!ar || !ar.userId) return res.status(400).send(errorPage('Authorization request expired or not authenticated.'));
  authRequests.delete(ar.id); // one-time use

  const redirect = new URL(ar.redirectUri);
  if (ar.state) redirect.searchParams.set('state', ar.state);
  redirect.searchParams.set('iss', ISSUER);

  if (req.body.decision !== 'allow') {
    redirect.searchParams.set('error', 'access_denied');
    redirect.searchParams.set('error_description', 'The user denied the request.');
    log('consent denied');
    return res.redirect(redirect.toString());
  }

  // Step 2: issue a short-lived, single-use authorization code bound to the PKCE challenge.
  const code = randomToken(32);
  authCodes.set(code, {
    clientId: ar.clientId,
    redirectUri: ar.redirectUri,
    scope: ar.scope,
    nonce: ar.nonce,
    codeChallenge: ar.codeChallenge,
    userId: ar.userId,
    authTime: Math.floor(Date.now() / 1000),
    expiresAt: Date.now() + CODE_TTL * 1000,
  });
  redirect.searchParams.set('code', code);
  log(`consent granted -> authorization code issued (valid ${CODE_TTL}s, single use)`);
  res.redirect(redirect.toString());
});

/* ------------------------------------------------------------------ */
/* Step 3: /token  (back channel, server-to-server)                    */
/* ------------------------------------------------------------------ */
async function issueTokens(user: User, clientId: string, scope: string, nonce?: string, authTime?: number) {
  const scopes = scope.split(' ');
  const body: Record<string, unknown> = {
    access_token: await signJwt({ scope, client_id: clientId }, {
      subject: user.id, audience: API_AUDIENCE, ttl: ACCESS_TOKEN_TTL, typ: 'at+jwt',
    }),
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL,
    scope,
  };

  if (scopes.includes('openid')) {
    const claims: Record<string, unknown> = { auth_time: authTime ?? Math.floor(Date.now() / 1000) };
    if (nonce) claims.nonce = nonce;
    if (scopes.includes('profile')) claims.name = user.name;
    if (scopes.includes('email')) Object.assign(claims, { email: user.email, email_verified: true });
    body.id_token = await signJwt(claims, { subject: user.id, audience: clientId, ttl: 300, typ: 'JWT' });
  }

  if (scopes.includes('offline_access')) {
    const rt = randomToken(32);
    refreshTokens.set(rt, { clientId, userId: user.id, scope, expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000 });
    body.refresh_token = rt;
  }
  return body;
}

app.post('/token', express.urlencoded({ extended: false }), wrap(async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  const b = req.body as Record<string, string | undefined>;
  const oauthError = (status: number, error: string, description: string) => {
    log(`/token rejected: ${error} (${description})`);
    return res.status(status).json({ error, error_description: description });
  };

  /* ---- grant_type=authorization_code ---- */
  if (b.grant_type === 'authorization_code') {
    const { code, redirect_uri, client_id, code_verifier } = b;
    if (!code || !redirect_uri || !client_id || !code_verifier) {
      return oauthError(400, 'invalid_request', 'code, redirect_uri, client_id and code_verifier are required.');
    }

    // Single use: remove the code BEFORE any further validation, so failed attempts burn it too.
    const record = authCodes.get(code);
    authCodes.delete(code);

    if (!record || record.expiresAt < Date.now()) return oauthError(400, 'invalid_grant', 'Code is invalid, expired or already used.');
    if (record.clientId !== client_id) return oauthError(400, 'invalid_grant', 'Code was issued to a different client.');
    if (record.redirectUri !== redirect_uri) return oauthError(400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
    if (!isValidVerifier(code_verifier)) return oauthError(400, 'invalid_grant', 'Malformed code_verifier.');

    // The heart of PKCE: BASE64URL(SHA256(code_verifier)) must equal the challenge sent in step 1.
    if (!verifyPkce(code_verifier, record.codeChallenge)) {
      return oauthError(400, 'invalid_grant', 'PKCE verification failed.');
    }

    const user = users.find((u) => u.id === record.userId)!;
    log(`/token OK (PKCE verified) -> tokens issued to ${client_id} for ${user.username}`);
    return res.json(await issueTokens(user, record.clientId, record.scope, record.nonce, record.authTime));
  }

  /* ---- grant_type=refresh_token (with rotation) ---- */
  if (b.grant_type === 'refresh_token') {
    const { refresh_token, client_id } = b;
    if (!refresh_token || !client_id) return oauthError(400, 'invalid_request', 'refresh_token and client_id are required.');

    const record = refreshTokens.get(refresh_token);
    refreshTokens.delete(refresh_token); // rotation: old token is dead whatever happens next
    if (!record || record.expiresAt < Date.now() || record.clientId !== client_id) {
      return oauthError(400, 'invalid_grant', 'Refresh token is invalid, expired or already used.');
    }
    const user = users.find((u) => u.id === record.userId)!;
    log(`/token refresh OK for ${user.username} (refresh token rotated)`);
    return res.json(await issueTokens(user, record.clientId, record.scope));
  }

  return oauthError(400, 'unsupported_grant_type', 'Supported: authorization_code, refresh_token.');
}));

/* ------------------------------------------------------------------ */
/* Protected resource: /userinfo                                       */
/* ------------------------------------------------------------------ */
app.get('/userinfo', wrap(async (req, res) => {
  const m = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '');
  if (!m) return res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'invalid_request' });
  try {
    const claims = await verifyAccessToken(m[1]);
    const user = users.find((u) => u.id === claims.sub);
    if (!user) throw new Error('unknown subject');
    const scopes = String(claims.scope ?? '').split(' ');
    const out: Record<string, unknown> = { sub: user.id };
    if (scopes.includes('profile')) out.name = user.name;
    if (scopes.includes('email')) Object.assign(out, { email: user.email, email_verified: true });
    log(`/userinfo served for ${user.username}`);
    res.json(out);
  } catch {
    res.status(401).set('WWW-Authenticate', 'Bearer error="invalid_token"').json({ error: 'invalid_token' });
  }
}));

app.get('/', (_req, res) => {
  res.type('text/plain').send(
    `Demo OAuth 2.0 / OIDC Identity Provider\n\nDiscovery: ${ISSUER}/.well-known/openid-configuration\nJWKS:      ${ISSUER}/.well-known/jwks.json\n`,
  );
});

app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  log(`Identity Provider listening on ${ISSUER}`);
  log(`access token TTL=${ACCESS_TOKEN_TTL}s, refresh TTL=${REFRESH_TOKEN_TTL}s, code TTL=${CODE_TTL}s`);
});
