import type { ClientConfig } from './config.js';
import { SCOPE_DESCRIPTIONS } from './config.js';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const css = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh}
.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:32px;width:min(420px,92vw);box-shadow:0 20px 40px rgba(0,0,0,.35)}
h1{font-size:1.25rem;margin:0 0 4px}.sub{color:#94a3b8;font-size:.9rem;margin:0 0 20px}
label{display:block;font-size:.8rem;color:#94a3b8;margin:14px 0 6px}
input[type=text],input[type=password]{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:1rem}
button{margin-top:20px;width:100%;padding:11px;border:0;border-radius:8px;background:#6366f1;color:#fff;font-size:1rem;cursor:pointer}
button.secondary{background:#334155;margin-top:10px}button:hover{filter:brightness(1.1)}
.err{background:#7f1d1d;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:.9rem}
.hint{margin-top:18px;font-size:.8rem;color:#94a3b8;border-top:1px solid #334155;padding-top:12px}
ul{padding-left:18px}li{margin:6px 0}code{background:#0f172a;padding:2px 6px;border-radius:4px}
.badge{display:inline-block;font-size:.7rem;background:#312e81;color:#c7d2fe;padding:2px 8px;border-radius:99px;margin-bottom:12px}
`;

const layout = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body><main class="card">${body}</main></body></html>`;

export function loginPage(o: { client: ClientConfig; requestId: string; error?: string }): string {
  return layout(
    'Sign in',
    `<span class="badge">Demo Identity Provider</span>
<h1>Sign in</h1>
<p class="sub"><b>${esc(o.client.name)}</b> wants to access your account.</p>
${o.error ? `<div class="err">${esc(o.error)}</div>` : ''}
<form method="post" action="/login" autocomplete="off">
  <input type="hidden" name="request_id" value="${esc(o.requestId)}">
  <label for="u">Username</label><input id="u" name="username" type="text" autofocus required>
  <label for="p">Password</label><input id="p" name="password" type="password" required>
  <button type="submit">Sign in</button>
</form>
<div class="hint">Demo users: <code>alice / wonderland</code> &nbsp; <code>bob / builder</code></div>`,
  );
}

export function consentPage(o: { client: ClientConfig; requestId: string; scope: string; userName: string }): string {
  const items = o.scope
    .split(' ')
    .map((s) => `<li><code>${esc(s)}</code> &mdash; ${esc(SCOPE_DESCRIPTIONS[s] ?? s)}</li>`)
    .join('');
  return layout(
    'Authorize',
    `<span class="badge">Demo Identity Provider</span>
<h1>Hi ${esc(o.userName)}</h1>
<p class="sub"><b>${esc(o.client.name)}</b> is requesting permission to:</p>
<ul>${items}</ul>
<form method="post" action="/consent">
  <input type="hidden" name="request_id" value="${esc(o.requestId)}">
  <button type="submit" name="decision" value="allow">Allow</button>
  <button type="submit" name="decision" value="deny" class="secondary">Deny</button>
</form>`,
  );
}

export function errorPage(message: string): string {
  return layout('Error', `<h1>Authorization error</h1><div class="err">${esc(message)}</div>`);
}
