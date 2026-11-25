import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { Db } from './db/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';

export function createApp(db: Db) {
  const app = express();
  app.set('trust proxy', 1); // behind nginx / a load balancer
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db: db.driver });
  });
  app.use('/api/auth', authRouter(db));
  app.use('/api/me', meRouter(db));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
