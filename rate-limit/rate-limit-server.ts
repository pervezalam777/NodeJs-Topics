import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(express.json());

// Define a standard rate limiter middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: 'draft-7', // Return standard rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  statusCode: 429, // HTTP status code when limit is exceeded
  message: {
    error: 'Too many requests, please try again later.',
  },
  // Optional: Custom key generator (e.g., rate limit by authenticated user ID instead of IP)
  keyGenerator: (req: Request): string => {
    return (req.headers['x-user-id'] as string) || req.ip || 'unknown';
  },
});

// Apply the rate limiter to all API routes
app.use('/api/', apiLimiter);

app.get('/api/data', (_req: Request, res: Response): void => {
  res.json({ message: 'Success! Here is your data.' });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app };
export default app;