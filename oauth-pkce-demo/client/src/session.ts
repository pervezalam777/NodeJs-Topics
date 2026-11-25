import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

export interface FlowStep {
  at: string;
  actor: 'client' | 'browser' | 'idp';
  title: string;
  detail?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number; // epoch ms
  scope: string;
}

export interface Session {
  id: string;
  createdAt: number;
  pending?: { state: string; nonce: string; codeVerifier: string };
  tokens?: TokenSet;
  user?: { sub: string; name?: string; email?: string };
  flow: FlowStep[];
  notice?: string;
}

const sessions = new Map<string, Session>();
const COOKIE = 'sid';
const MAX_AGE_S = 3600;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function getSession(req: Request, res: Response): Session {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  const existing = sid ? sessions.get(sid) : undefined;
  if (existing) return existing;

  const id = randomBytes(32).toString('base64url');
  const s: Session = { id, createdAt: Date.now(), flow: [] };
  sessions.set(id, s);
  // HttpOnly: JS in the page can't read it. Tokens never leave the server.
  res.append('Set-Cookie', `${COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}`);
  return s;
}

export function destroySession(req: Request, res: Response) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (sid) sessions.delete(sid);
  res.append('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function addStep(s: Session, actor: FlowStep['actor'], title: string, detail?: string) {
  s.flow.push({ at: new Date().toLocaleTimeString(), actor, title, detail });
  console.log(`\x1b[36m[client]\x1b[0m ${title}`);
}

setInterval(() => {
  const cutoff = Date.now() - MAX_AGE_S * 1000;
  for (const [k, v] of sessions) if (v.createdAt < cutoff) sessions.delete(k);
}, 60_000).unref();
