import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

export interface AccessPayload {
  sub: string;
  email: string;
}
export interface RefreshPayload {
  sub: string;
  jti: string;
  fam: string;
}

export async function signAccessToken(user: { id: string; email: string }): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(config.accessTtl)
    .sign(config.accessSecret);
}

export async function signRefreshToken(userId: string, familyId: string) {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + config.refreshTtlMs);
  const token = await new SignJWT({ fam: familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(config.refreshSecret);
  return { token, jti, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, config.accessSecret, { algorithms: ['HS256'] });
  if (!payload.sub || typeof payload['email'] !== 'string') throw new Error('Malformed access token');
  return { sub: payload.sub, email: payload['email'] };
}

export async function verifyRefreshToken(token: string): Promise<RefreshPayload> {
  const { payload } = await jwtVerify(token, config.refreshSecret, { algorithms: ['HS256'] });
  if (!payload.sub || !payload.jti || typeof payload['fam'] !== 'string') {
    throw new Error('Malformed refresh token');
  }
  return { sub: payload.sub, jti: payload.jti, fam: payload['fam'] };
}
