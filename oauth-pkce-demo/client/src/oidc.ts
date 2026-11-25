import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { CLIENT_ID, IDP_URL } from './config.js';
import { safeEqual } from './pkce.js';

export interface Metadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
}

export class OAuthError extends Error {
  constructor(public status: number, public code: string, description: string) {
    super(`${code}: ${description}`);
  }
}

let cached: { meta: Metadata; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined;

/** OIDC discovery: learn the IdP's endpoints + signing keys from one well-known URL. */
export async function discover() {
  if (cached) return cached;
  let r: Response;
  try {
    r = await fetch(`${IDP_URL}/.well-known/openid-configuration`);
  } catch {
    throw new Error(`Cannot reach the Identity Provider at ${IDP_URL}. Is it running?`);
  }
  if (!r.ok) throw new Error(`Discovery failed with HTTP ${r.status}`);
  const meta = (await r.json()) as Metadata;
  cached = { meta, jwks: createRemoteJWKSet(new URL(meta.jwks_uri), { cooldownDuration: 1000 }) };
  return cached;
}

/** Back-channel POST to the token endpoint. */
export async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { meta } = await discover();
  const r = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, string>;
  if (!r.ok) throw new OAuthError(r.status, data.error ?? 'server_error', data.error_description ?? 'Token request failed');
  return data as unknown as TokenResponse;
}

/** Validate the ID token: signature (JWKS), issuer, audience (= our client_id), expiry, nonce. */
export async function verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload> {
  const { meta, jwks } = await discover();
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: meta.issuer,
    audience: CLIENT_ID,
    algorithms: ['RS256'],
  });
  if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, expectedNonce)) {
    throw new Error('ID token nonce mismatch');
  }
  return payload;
}
