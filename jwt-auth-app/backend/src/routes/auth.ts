import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../utils/cookies.js';
import { HttpError } from '../utils/httpError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

// import { RedisStore } from 'rate-limit-redis';
// import { Redis } from 'ioredis';

//const redis = new Redis(process.env.REDIS_URL!); // ElastiCache

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});
const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(72),
});

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

// Pre-computed hash so login takes the same time whether or not the user exists (anti-enumeration)
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);

export function authRouter(db: Db): Router {
  const router = Router();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later' },
    //store: new RedisStore({ sendCommand: (...args: string[]) => redis.call(...args) as any }),
  });

  /** Create a refresh token row and return the signed JWT. */
  async function issueRefresh(userId: string, familyId: string) {
    const { token, jti, expiresAt } = await signRefreshToken(userId, familyId);
    await db.query(
      'INSERT INTO refresh_tokens (id, user_id, family_id, expires_at) VALUES ($1, $2, $3, $4)',
      [jti, userId, familyId, expiresAt],
    );
    return token;
  }

  router.post('/register', authLimiter, async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    const existing = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.length > 0) throw new HttpError(409, 'Email already registered');

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    await db.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [
      id,
      email,
      name,
      passwordHash,
    ]);
    res.status(201).json({ user: { id, email, name } });
  });

  router.post('/login', authLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const [user] = await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);

    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password');

    const familyId = randomUUID(); // new login = new token family
    const [access, refresh] = await Promise.all([
      signAccessToken(user),
      issueRefresh(user.id, familyId),
    ]);
    setAuthCookies(res, access, refresh);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  /** Rotating refresh: each refresh token is single-use. Reuse of an old one revokes the whole family. */
  router.post('/refresh', async (req, res) => {
    const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new HttpError(401, 'No refresh token');

    let payload;
    try {
      payload = await verifyRefreshToken(token);
    } catch {
      clearAuthCookies(res);
      throw new HttpError(401, 'Invalid refresh token');
    }

    const [row] = await db.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM refresh_tokens WHERE id = $1 AND user_id = $2',
      [payload.jti, payload.sub],
    );

    if (!row) {
      clearAuthCookies(res);
      throw new HttpError(401, 'Unknown refresh token');
    }
    if (row.revoked_at) {
      // Token reuse detected -> assume theft, kill every token in this session family
      await db.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
        [payload.fam],
      );
      clearAuthCookies(res);
      throw new HttpError(401, 'Refresh token reuse detected, please log in again');
    }

    const [user] = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (!user) {
      clearAuthCookies(res);
      throw new HttpError(401, 'User no longer exists');
    }

    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [payload.jti]);
    const [access, refresh] = await Promise.all([
      signAccessToken(user),
      issueRefresh(user.id, payload.fam),
    ]);
    setAuthCookies(res, access, refresh);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  router.post('/logout', async (req, res) => {
    const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      try {
        const { fam } = await verifyRefreshToken(token);
        await db.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
          [fam],
        );
      } catch {
        /* token already invalid -> nothing to revoke */
      }
    }
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  });

  /** Revoke every session of the current user (all devices). */
  router.post('/logout-all', authenticate, async (req, res) => {
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [req.user!.id],
    );
    clearAuthCookies(res);
    res.json({ message: 'Logged out everywhere' });
  });

  return router;
}
