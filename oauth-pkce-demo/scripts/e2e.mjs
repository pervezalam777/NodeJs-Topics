// End-to-end test: acts like a browser against the RUNNING idp (4000) and client (3000).
// Usage: npm run dev (in another terminal), then: npm run e2e
import { createHash, randomBytes } from 'node:crypto';

const CLIENT = process.env.CLIENT_URL ?? 'http://localhost:3000';
const IDP = process.env.IDP_URL ?? 'http://localhost:4000';
const REDIRECT = `${CLIENT}/callback`;

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => {
  cond ? passed++ : failed++;
  console.log(`${cond ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${name}${!cond && extra ? `  → ${extra}` : ''}`);
};

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
async function http(url, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  if (jar.size && url.startsWith(CLIENT)) headers.cookie = cookieHeader();
  const r = await fetch(url, { ...opts, headers, redirect: 'manual' });
  if (url.startsWith(CLIENT)) for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
  return r;
}
const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
const requestId = (html) => /name="request_id" value="([^"]+)"/.exec(html)?.[1];

/* ---------- 1. Full flow through the real client app ---------- */
console.log('\n== Full flow via the client app ==');
let r = await http(`${CLIENT}/login`);
ok(r.status === 302, 'client /login redirects to the IdP');
const authUrl = new URL(r.headers.get('location'));
ok(authUrl.searchParams.get('code_challenge_method') === 'S256', 'authorization request uses PKCE S256');
ok(!authUrl.searchParams.has('code_verifier'), 'code_verifier is NOT sent in the front channel');

r = await http(authUrl.toString());
let rid = requestId(await r.text());
ok(r.status === 200 && rid, 'IdP shows login page');

r = await http(`${IDP}/login`, form({ request_id: rid, username: 'alice', password: 'wrong' }));
ok(r.status === 401, 'wrong password is rejected');
r = await http(`${IDP}/login`, form({ request_id: rid, username: 'alice', password: 'wonderland' }));
ok(r.status === 200 && (await r.text()).includes('Allow'), 'correct password shows consent page');

r = await http(`${IDP}/consent`, form({ request_id: rid, decision: 'allow' }));
const cb = new URL(r.headers.get('location'));
ok(r.status === 302 && cb.searchParams.has('code'), 'IdP redirects back with an authorization code');

r = await http(cb.toString());
ok(r.status === 302 && r.headers.get('location') === '/', 'client /callback exchanged code and logged the user in');

r = await http(`${CLIENT}/api/me`);
const me = await r.json();
ok(r.status === 200 && me.email === 'alice@example.com', 'protected call with access token works', JSON.stringify(me));

r = await http(`${CLIENT}/refresh`, { method: 'POST' });
r = await http(`${CLIENT}/api/me`);
ok(r.status === 200, 'refresh-token rotation keeps the session working');

// state tampering on the client callback
jar.clear();
r = await http(`${CLIENT}/login`);
const au2 = new URL(r.headers.get('location'));
r = await http(`${CLIENT}/callback?code=abc&state=forged`);
ok(r.status === 400, 'callback with forged state is rejected (CSRF)');

/* ---------- 2. Attack scenarios directly against the IdP ---------- */
console.log('\n== PKCE / security checks against the IdP ==');
const b64u = (b) => b.toString('base64url');
const newPkce = () => { const v = b64u(randomBytes(32)); return { v, c: b64u(createHash('sha256').update(v).digest()) }; };

async function getCode(challenge) {
  const q = new URLSearchParams({ response_type: 'code', client_id: 'demo-client', redirect_uri: REDIRECT, scope: 'openid profile email offline_access', state: 's1', nonce: 'n1', code_challenge: challenge, code_challenge_method: 'S256' });
  let r = await http(`${IDP}/authorize?${q}`);
  const rid = requestId(await r.text());
  await http(`${IDP}/login`, form({ request_id: rid, username: 'bob', password: 'builder' }));
  r = await http(`${IDP}/consent`, form({ request_id: rid, decision: 'allow' }));
  return new URL(r.headers.get('location')).searchParams.get('code');
}
const exchange = (code, verifier) => http(`${IDP}/token`, form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'demo-client', code_verifier: verifier }));

let p = newPkce();
let code = await getCode(p.c);
r = await exchange(code, newPkce().v);
ok(r.status === 400 && (await r.json()).error === 'invalid_grant', 'attacker with stolen code but WRONG verifier is rejected');
r = await exchange(code, p.v);
ok(r.status === 400, 'that code is burned even for the legit client after a failed attempt');

p = newPkce();
code = await getCode(p.c);
r = await exchange(code, p.v);
const tokens = await r.json();
ok(r.status === 200 && tokens.access_token && tokens.id_token && tokens.refresh_token, 'correct verifier → access, id and refresh tokens');
r = await exchange(code, p.v);
ok(r.status === 400, 'authorization code cannot be replayed');

r = await http(`${IDP}/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
ok(r.status === 200 && (await r.json()).name === 'Bob Builder', '/userinfo accepts the access token');
r = await http(`${IDP}/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}x` } });
ok(r.status === 401, '/userinfo rejects a tampered token');

const rt = (t) => http(`${IDP}/token`, form({ grant_type: 'refresh_token', refresh_token: t, client_id: 'demo-client' }));
r = await rt(tokens.refresh_token);
const t2 = await r.json();
ok(r.status === 200 && t2.refresh_token && t2.refresh_token !== tokens.refresh_token, 'refresh token is rotated');
r = await rt(tokens.refresh_token);
ok(r.status === 400, 'old refresh token is rejected after rotation');

// authorize endpoint validation
let q = new URLSearchParams({ response_type: 'code', client_id: 'demo-client', redirect_uri: REDIRECT, state: 'x' });
r = await http(`${IDP}/authorize?${q}`);
ok(r.status === 302 && new URL(r.headers.get('location')).searchParams.get('error') === 'invalid_request', 'authorize without code_challenge is refused (PKCE mandatory)');
q = new URLSearchParams({ response_type: 'code', client_id: 'demo-client', redirect_uri: 'http://evil.example/cb', code_challenge: newPkce().c, code_challenge_method: 'S256' });
r = await http(`${IDP}/authorize?${q}`);
ok(r.status === 400, 'unregistered redirect_uri gets an error page, NOT a redirect');
q = new URLSearchParams({ response_type: 'code', client_id: 'demo-client', redirect_uri: REDIRECT, code_challenge: newPkce().c, code_challenge_method: 'plain' });
r = await http(`${IDP}/authorize?${q}`);
ok(r.status === 302 && new URL(r.headers.get('location')).searchParams.get('error') === 'invalid_request', 'code_challenge_method=plain is refused');

console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failed} failed\x1b[0m`);
process.exit(failed ? 1 : 0);
