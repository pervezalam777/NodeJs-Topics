import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, generateKeyPair, exportJWK, type JWTPayload } from 'jose';
import { API_AUDIENCE, ISSUER } from './config.js';

// A fresh RSA key pair is generated at start-up (tokens from previous runs become invalid).
const { publicKey, privateKey } = await generateKeyPair('RS256');
const kid = randomUUID();

export const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };

export async function signJwt(
  claims: JWTPayload,
  opts: { subject: string; audience: string; ttl: number; typ: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid, typ: opts.typ })
    .setIssuer(ISSUER)
    .setSubject(opts.subject)
    .setAudience(opts.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + opts.ttl)
    .setJti(randomUUID())
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ISSUER,
    audience: API_AUDIENCE,
    algorithms: ['RS256'],
  });
  return payload;
}
