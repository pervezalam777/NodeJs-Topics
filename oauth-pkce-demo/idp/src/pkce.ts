import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** RFC 7636: verifier is 43-128 chars from the unreserved set. */
export const isValidVerifier = (v: string) => /^[A-Za-z0-9\-._~]{43,128}$/.test(v);

/** S256 challenge = BASE64URL(SHA256(verifier)) => always 43 chars. */
export const isValidChallenge = (c: string) => /^[A-Za-z0-9_-]{43}$/.test(c);

export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
