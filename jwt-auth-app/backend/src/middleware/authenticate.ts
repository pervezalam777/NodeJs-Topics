import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { HttpError } from '../utils/httpError.js';
import { verifyAccessToken } from '../utils/tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string };
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token: string | undefined = req.cookies?.[ACCESS_COOKIE] ?? bearer;
  if (!token) throw new HttpError(401, 'Not authenticated');

  try {
    const payload = await verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
}
