// In-memory stores. Swap for Redis/a database in production.

export interface AuthRequest {
  id: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  nonce?: string;
  codeChallenge: string;
  userId?: string; // set after successful login
  createdAt: number;
}

export interface AuthCode {
  clientId: string;
  redirectUri: string;
  scope: string;
  nonce?: string;
  codeChallenge: string;
  userId: string;
  authTime: number;
  expiresAt: number;
}

export interface RefreshRecord {
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

export const authRequests = new Map<string, AuthRequest>();
export const authCodes = new Map<string, AuthCode>();
export const refreshTokens = new Map<string, RefreshRecord>();

const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authRequests) if (now - v.createdAt > AUTH_REQUEST_TTL_MS) authRequests.delete(k);
  for (const [k, v] of authCodes) if (v.expiresAt < now) authCodes.delete(k);
  for (const [k, v] of refreshTokens) if (v.expiresAt < now) refreshTokens.delete(k);
}, 30_000).unref();

export { AUTH_REQUEST_TTL_MS };
