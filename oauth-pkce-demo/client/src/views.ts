import type { Session } from './session.js';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const shorten = (t: string) => (t.length > 44 ? `${t.slice(0, 24)}…${t.slice(-12)}` : t);

const css = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.5}
main{max-width:900px;margin:0 auto;padding:32px 20px 80px}
h1{margin:0 0 4px;font-size:1.7rem}h2{font-size:1.1rem;margin:32px 0 12px}.sub{color:#94a3b8;margin:0 0 24px}
.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:20px;margin-bottom:16px}
.btn{display:inline-block;padding:10px 18px;border-radius:8px;background:#6366f1;color:#fff;text-decoration:none;border:0;font-size:.95rem;cursor:pointer;margin-right:8px}
.btn.alt{background:#334155}.btn:hover{filter:brightness(1.1)}
pre{background:#0b1220;border:1px solid #1e293b;border-radius:8px;padding:12px;overflow:auto;font-size:.8rem;margin:8px 0 0;white-space:pre-wrap;word-break:break-all}
code{background:#0b1220;padding:2px 6px;border-radius:4px;font-size:.85em}
ol.flow{list-style:none;padding:0;margin:0;border-left:2px solid #334155}
ol.flow li{margin:0 0 14px 16px;padding-left:14px;position:relative}
ol.flow li::before{content:"";position:absolute;left:-24px;top:7px;width:10px;height:10px;border-radius:50%;background:#6366f1}
.tag{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:99px;margin-right:8px}
.client{background:#164e63;color:#a5f3fc}.browser{background:#365314;color:#d9f99d}.idp{background:#581c87;color:#e9d5ff}
.time{color:#64748b;font-size:.75rem;float:right}
table{width:100%;border-collapse:collapse;font-size:.9rem}td{padding:6px 0;border-bottom:1px solid #334155;vertical-align:top}td:first-child{color:#94a3b8;width:150px}
.notice{background:#422006;border:1px solid #854d0e;border-radius:10px;padding:10px 14px;margin-bottom:16px}
.steps li{margin:6px 0}
`;

function flowHtml(s: Session): string {
  if (!s.flow.length) return '<p class="sub">No flow recorded yet. Click “Sign in” to start one.</p>';
  return `<ol class="flow">${s.flow
    .map(
      (f) => `<li><span class="time">${esc(f.at)}</span><span class="tag ${f.actor}">${f.actor}</span><b>${esc(f.title)}</b>${
        f.detail ? `<pre>${esc(f.detail)}</pre>` : ''
      }</li>`,
    )
    .join('')}</ol>`;
}

export interface HomeData {
  session: Session;
  idpUrl: string;
  idClaims?: Record<string, unknown>;
  accessClaims?: Record<string, unknown>;
}

export function homePage(d: HomeData): string {
  const s = d.session;
  const t = s.tokens;
  const secs = t ? Math.max(0, Math.round((t.expiresAt - Date.now()) / 1000)) : 0;

  const signedOut = `
<div class="card">
  <p style="margin-top:0">This app is an OAuth 2.0 / OIDC <b>client</b>. It never sees your password: it sends you to the
  separate Identity Provider (<code>${esc(d.idpUrl)}</code>), then trades a one-time code for tokens using <b>PKCE</b>.</p>
  <a class="btn" href="/login">Sign in with Demo IdP</a>
</div>
<h2>How it works</h2>
<div class="card"><ol class="steps">
  <li><b>Client</b> creates a random <code>code_verifier</code> and sends only its hash (<code>code_challenge</code>) plus <code>state</code> to the IdP via the browser.</li>
  <li><b>User</b> signs in and approves access on the IdP.</li>
  <li><b>IdP</b> redirects back with a short-lived, single-use <code>code</code>.</li>
  <li><b>Client</b> POSTs the <code>code</code> + the original <code>code_verifier</code> directly to the IdP's token endpoint (back channel).</li>
  <li><b>IdP</b> hashes the verifier, compares with the stored challenge, and only then issues tokens. A stolen code is useless without the verifier.</li>
</ol></div>`;

  const signedIn = t && s.user ? `
<div class="card">
  <table>
    <tr><td>Signed in as</td><td><b>${esc(s.user.name ?? s.user.sub)}</b> ${s.user.email ? `(${esc(s.user.email)})` : ''}</td></tr>
    <tr><td>Subject (sub)</td><td><code>${esc(s.user.sub)}</code></td></tr>
    <tr><td>Granted scope</td><td><code>${esc(t.scope)}</code></td></tr>
    <tr><td>Access token</td><td><code>${esc(shorten(t.accessToken))}</code><br><small>expires in ~${secs}s</small></td></tr>
    <tr><td>Refresh token</td><td>${t.refreshToken ? `<code>${esc(shorten(t.refreshToken))}</code>` : '—'}</td></tr>
    <tr><td>ID token</td><td>${t.idToken ? `<code>${esc(shorten(t.idToken))}</code>` : '—'}</td></tr>
  </table>
  <p style="margin-bottom:0">
    <button class="btn" onclick="callApi()">Call /api/me (userinfo)</button>
    <form method="post" action="/refresh" style="display:inline"><button class="btn alt" type="submit">Force token refresh</button></form>
    <form method="post" action="/logout" style="display:inline"><button class="btn alt" type="submit">Log out</button></form>
  </p>
  <pre id="out" style="display:none"></pre>
</div>
<p class="sub">Tokens live in this server's session. The browser only holds an <code>HttpOnly</code> session cookie.</p>
${d.idClaims ? `<h2>ID token claims (verified)</h2><div class="card"><pre>${esc(JSON.stringify(d.idClaims, null, 2))}</pre></div>` : ''}
${d.accessClaims ? `<h2>Access token claims (decoded for display)</h2><div class="card"><pre>${esc(JSON.stringify(d.accessClaims, null, 2))}</pre></div>` : ''}
` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OAuth 2.0 + PKCE demo</title><style>${css}</style></head><body><main>
<h1>OAuth 2.0 Authorization Code Flow + PKCE</h1>
<p class="sub">Client backend (Node.js + TypeScript) &nbsp;↔&nbsp; separate Identity Provider</p>
${s.notice ? `<div class="notice">${esc(s.notice)}</div>` : ''}
${t ? signedIn : signedOut}
<h2>Flow log</h2><div class="card">${flowHtml(s)}</div>
<script>
async function callApi(){
  const out=document.getElementById('out');out.style.display='block';out.textContent='Loading…';
  const r=await fetch('/api/me');out.textContent=r.status+' '+JSON.stringify(await r.json(),null,2);
}
</script></main></body></html>`;
}

export function errorPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Error</title><style>${css}</style></head><body><main>
<h1>Something went wrong</h1><div class="notice">${esc(message)}</div><a class="btn" href="/">Back</a></main></body></html>`;
}
