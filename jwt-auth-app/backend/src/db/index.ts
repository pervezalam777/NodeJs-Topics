import { config } from '../config.js';

/**
 * Minimal DB interface shared by both drivers.
 * Both speak real PostgreSQL SQL ($1, $2 placeholders), so queries are identical
 * in local dev (PGlite = Postgres compiled to WASM) and in Docker/production (pg).
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  readonly driver: 'pg' | 'pglite';
}

async function createPgDb(url: string): Promise<Db> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url });
  return {
    driver: 'pg',
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql) {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

async function createPgliteDb(dir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.waitReady;
  return {
    driver: 'pglite',
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await client.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql) {
      await client.exec(sql);
    },
    close: () => client.close(),
  };
}

export async function createDb(): Promise<Db> {
  return config.databaseUrl ? createPgDb(config.databaseUrl) : createPgliteDb(config.pgliteDir);
}
