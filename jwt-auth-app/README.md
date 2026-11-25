# JWT Auth App: React + Node.js (TypeScript) + PostgreSQL

Custom login with JWT session management.

- **Frontend:** React 19, TypeScript, Vite, React Router
- **Backend:** Node.js (ESM), TypeScript, Express 5, `jose` (JWT), `bcryptjs`, `zod`
- **DB:** PostgreSQL in Docker; **PGlite** (real Postgres compiled to WASM, zero install) for local dev

## How auth works

| Piece | Details |
|---|---|
| Passwords | bcrypt (cost 12). Constant-time login to avoid user enumeration |
| Access token | JWT, 15 min, httpOnly + SameSite=Strict cookie |
| Refresh token | JWT (7 days) with a `jti`, stored in the DB, httpOnly cookie scoped to `/api/auth` |
| Rotation | Every `/refresh` revokes the used token and issues a new one |
| Reuse detection | Presenting an already-used refresh token revokes the **whole session family** (theft signal) |
| Logout | Revokes the session family; `/logout-all` revokes all sessions of the user |
| Silent refresh | Frontend `api()` retries once after a transparent `/refresh` when it gets a 401 |
| Hardening | helmet, rate limiting on register/login, zod validation, 10kb body limit |

Tokens never touch JS-accessible storage (no localStorage), so XSS can't steal them.

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | `{name, email, password}` |
| POST | `/api/auth/login` | no | sets cookies |
| POST | `/api/auth/refresh` | refresh cookie | rotates tokens |
| POST | `/api/auth/logout` | refresh cookie | revokes current session |
| POST | `/api/auth/logout-all` | access cookie | revokes all sessions |
| GET | `/api/me` | access cookie | example protected route |
| GET | `/api/health` | no | health check |

## Run with Docker (PostgreSQL)

```bash
cp .env.example .env
# edit .env: set ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET (>= 32 chars each)
docker compose up --build
```

Open http://localhost:8080. nginx serves the React app and proxies `/api` to the backend, so the browser sees a single origin.

Stop: `docker compose down` (add `-v` to wipe the database).

## Local development (no Docker, no Postgres install)

Requires Node.js 22+.

```bash
# terminal 1: API on :3000
cd backend
cp .env.example .env        # DATABASE_URL empty -> uses embedded PGlite (data in backend/data/)
npm install
npm run dev

# terminal 2: UI on :5173 (proxies /api -> :3000)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

### Local DB: PGlite vs real Postgres

`backend/src/db/index.ts` picks the driver from `DATABASE_URL`:

- empty -> **PGlite** (actual PostgreSQL engine in WASM, so SQL, types, and constraints behave like production)
- set -> `pg` connection pool

To dev against a Postgres container instead: `docker compose up db -d`, then set
`DATABASE_URL=postgres://app:change_me@localhost:5432/app` in `backend/.env` and publish port 5432 (add `ports: ["5432:5432"]` to the `db` service).

Reset local data: delete `backend/data/`.

## Project layout

```
backend/src/
  config.ts            env validation (zod)
  db/index.ts          pg / PGlite driver abstraction
  db/migrate.ts        schema (runs on startup)
  utils/tokens.ts      sign/verify JWTs
  utils/cookies.ts     cookie options
  middleware/          authenticate, errorHandler
  routes/auth.ts       register/login/refresh/logout
  routes/me.ts         protected example
frontend/src/
  lib/api.ts           fetch wrapper with silent refresh
  context/AuthContext  auth state
  components/          ProtectedRoute, AuthForm
  pages/               Login, Register, Dashboard
```

## Production notes

- Serve over **HTTPS** and set `COOKIE_SECURE=true`.
- Use strong, distinct secrets from a secret manager.
- Replace startup `migrate()` with a migration tool (node-pg-migrate, Drizzle, Prisma) as the schema grows.
- If the API and frontend are on different origins, you'll need CORS with credentials and `SameSite=Lax/None`, plus CSRF tokens. The bundled same-origin proxy setup avoids this.
