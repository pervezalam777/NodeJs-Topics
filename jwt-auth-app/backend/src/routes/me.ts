import { Router } from 'express';
import type { Db } from '../db/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { HttpError } from '../utils/httpError.js';

export function meRouter(db: Db): Router {
  const router = Router();

  // Example protected route
  router.get('/', authenticate, async (req, res) => {
    const [user] = await db.query<{ id: string; email: string; name: string; created_at: Date }>(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [req.user!.id],
    );
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user });
  });

  return router;
}
