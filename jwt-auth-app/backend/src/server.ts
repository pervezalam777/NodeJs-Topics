import { config } from './config.js';
import { createApp } from './app.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';

const db = await createDb();
await migrate(db);

// Housekeeping: purge expired refresh tokens hourly
setInterval(
  () => db.query('DELETE FROM refresh_tokens WHERE expires_at < now()').catch(console.error),
  60 * 60 * 1000,
).unref();

const server = createApp(db).listen(config.port, () => {
  console.log(`API listening on :${config.port} (env=${config.env}, db=${db.driver})`);
});

const shutdown = () => {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
