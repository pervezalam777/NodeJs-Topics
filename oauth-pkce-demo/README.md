# OAuth 2.0 Authorization Code Flow + PKCE — Demo

Two **separate** Node.js + TypeScript apps:

| App | Folder | Port | Role |
|---|---|---|---|
| Identity Provider (IdP) | `idp/` | 4000 | Authorization server: login, consent, `/authorize`, `/token`, `/userinfo`, JWKS, OIDC discovery |
| Client backend | `client/` | 3000 | Web app backend that signs users in via the IdP and calls a protected API |

The client is a *public client* (no client secret): **PKCE is what protects the code exchange**.
Tokens are kept in the client's server-side session; the browser only gets an `HttpOnly` session cookie.

## Run it

Requires Node.js 18.17+ (tested on 22).

```bash
npm install          # installs both apps (npm workspaces)
npm run dev          # starts IdP (4000) + client (3000) with auto-reload
```

Open http://localhost:3000 → **Sign in with Demo IdP** → log in as `alice / wonderland` (or `bob / builder`) → Allow.
The page shows the tokens, the verified ID-token claims, and a step-by-step **flow log** of everything that happened.

Production-style run: `npm run build && npm start`.
Each app also runs on its own: `cd idp && npm install && npm run dev` (same for `client`).

Verify everything automatically (servers must be running):

```bash
npm run e2e          # 22 checks: full login flow + PKCE/security attack scenarios
```

## The flow

```
 Browser                    Client backend (:3000)                 IdP (:4000)
    │  GET /login                   │                                   │
    │──────────────────────────────>│ 1. code_verifier = random(32B)    │
    │                               │    code_challenge = B64URL(SHA256(verifier))
    │                               │    state, nonce                   │
    │<── 302 /authorize?code_challenge=…&state=… ───────────────────────│
    │──────────────────────────────────────────────────────────────────>│ validate client, redirect_uri,
    │<─────────────────────── login + consent pages ────────────────────│ PKCE params; user signs in
    │<── 302 /callback?code=…&state=…&iss=… ────────────────────────────│ 2. one-time code (60 s), bound to challenge
    │──────────────────────────────>│ 3. check state (CSRF) + iss       │
    │                               │ 4. POST /token  code + code_verifier ──────────────>│ SHA256(verifier) == challenge ?
    │                               │<──────── access_token, id_token, refresh_token ─────│ yes → issue tokens
    │                               │ 5. verify ID token (JWKS, iss, aud, exp, nonce)
    │<── 302 / (session cookie) ────│ 6. GET /userinfo  Authorization: Bearer … ─────────>│
```

Why PKCE helps: an attacker who intercepts the `code` (via a redirect, logs, a malicious app…) cannot redeem it,
because they don't have the `code_verifier`, which never travels through the browser.

## What's implemented

**IdP (`idp/src`)**
- `GET /authorize` — exact `redirect_uri` matching, `response_type=code` only, **PKCE (S256) mandatory** (`plain` rejected), scope filtering
- Login + consent screens (`POST /login`, `POST /consent`), one-time auth requests
- `POST /token` — `authorization_code` (single-use code, 60 s TTL, binds client + redirect_uri + PKCE) and `refresh_token` with **rotation**
- RS256-signed JWT access tokens + OIDC ID tokens (with `nonce`), fresh RSA key per start
- `GET /userinfo` (Bearer-protected), `/.well-known/openid-configuration`, `/.well-known/jwks.json`
- RFC 9207 `iss` parameter on authorization responses, `Cache-Control: no-store` everywhere

**Client (`client/src`)**
- OIDC discovery, PKCE generation, `state` + `nonce`, callback validation
- Back-channel code exchange, ID-token validation via remote JWKS
- Server-side sessions, automatic refresh when the access token is about to expire
- `GET /api/me` calls the IdP's protected `/userinfo`

## Try these

- **Refresh tokens:** start with short-lived tokens and click *Call /api/me* repeatedly:
  `ACCESS_TOKEN_TTL=20 npm run dev` (Windows PowerShell: `$env:ACCESS_TOKEN_TTL=20; npm run dev`).
- **Break PKCE:** edit `client/src/index.ts` to send a different `code_verifier` in the token request → `invalid_grant`.
- **Break CSRF protection:** open `/callback?code=x&state=forged` → rejected.

## Configuration (env vars)

| Var | App | Default |
|---|---|---|
| `PORT` | both | 4000 (idp) / 3000 (client) |
| `ISSUER` | idp | `http://localhost:4000` |
| `CLIENT_REDIRECT_URI` | idp | `http://localhost:3000/callback` |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` / `CODE_TTL` | idp | 300 / 3600 / 60 (seconds) |
| `IDP_URL`, `CLIENT_ID`, `REDIRECT_URI`, `SCOPE` | client | `http://localhost:4000`, `demo-client`, `http://localhost:3000/callback`, `openid profile email offline_access` |

## Demo-only shortcuts (do not copy to production)

- Plain-text passwords and in-memory stores (codes, sessions, refresh tokens) — use a password hash (argon2) and Redis/DB
- Signing key regenerated on each start — use persistent keys with rotation
- HTTP on localhost — use HTTPS and `Secure` cookies; add rate limiting, CSRF tokens on the login form, and an IdP SSO session
- Logout only clears the client session (no RP-initiated logout at the IdP)
