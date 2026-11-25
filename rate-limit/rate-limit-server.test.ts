import request from 'supertest';
import express, { type Express, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

// Helper app setup for testing
function createTestApp(maxRequests: number): Express {
  const app = express();
  const limiter = rateLimit({
    windowMs: 1000, // 1 second window for fast tests
    max: maxRequests,
    standardHeaders: true,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/test', limiter, (_req: Request, res: Response): void => {
    res.status(200).send('OK');
  });
  return app;
}

describe('API Rate Limiter Integration Test', () => {
  test('should allow requests under the limit and block when exceeded', async () => {
    const app = createTestApp(2); // Limit to 2 requests per second

    // Request 1: Should pass
    const res1 = await request(app).get('/test');
    expect(res1.status).toBe(200);
    expect(res1.headers['ratelimit-remaining']).toBe('1');

    // Request 2: Should pass
    const res2 = await request(app).get('/test');
    expect(res2.status).toBe(200);
    expect(res2.headers['ratelimit-remaining']).toBe('0');

    // Request 3: Should be rate limited
    const res3 = await request(app).get('/test');
    expect(res3.status).toBe(429);
    expect(res3.body.error).toBeDefined();
  });
});