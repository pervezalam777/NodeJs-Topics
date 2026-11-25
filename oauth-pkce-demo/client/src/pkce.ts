import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 7636 code_verifier: 32 random bytes -> 43 URL-safe chars (min allowed length). */
export const generateCodeVerifier = () => randomBytes(32).toString('base64url');

/** code_challenge = BASE64URL(SHA256(code_verifier)), method "S256". */
export const codeChallengeS256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** Unguessable value for `state` (CSRF protection) and `nonce` (ID-token replay protection). */
export const randomToken = (bytes = 16) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
