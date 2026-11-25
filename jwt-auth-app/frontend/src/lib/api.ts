export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

let refreshing: Promise<boolean> | null = null;

/** Ask the server for a new access token. Concurrent callers share one request (refresh tokens are single-use). */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include', // send httpOnly cookies
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  // Access token expired -> silently refresh once, then retry the original request
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, init, false);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'Request failed', body.details);
  return body as T;
}
