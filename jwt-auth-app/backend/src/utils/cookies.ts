import type { CookieOptions, Response } from 'express';
import { config } from '../config.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_PATH = '/api/auth';

const base: CookieOptions = {
  httpOnly: true, // JS can't read it -> XSS can't steal it
  secure: config.cookieSecure,
  sameSite: 'strict', // not sent on cross-site requests -> CSRF protection
};

export function setAuthCookies(res: Response, access: string, refresh: string) {
  res.cookie(ACCESS_COOKIE, access, { ...base, path: '/', maxAge: config.accessTtlMs });
  // Refresh cookie is only sent to /api/auth/* so it isn't attached to every request
  res.cookie(REFRESH_COOKIE, refresh, { ...base, path: REFRESH_PATH, maxAge: config.refreshTtlMs });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}
