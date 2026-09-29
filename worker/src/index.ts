import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import type { AppBindings } from './env';
import { AppError, errorBody } from './errors';
import { trackRoute } from './routes/track';

const app = new Hono<AppBindings>();

app.use(
  '/api/*',
  cors({
    origin: (origin, c: Context<AppBindings>) => {
      const allowed = c.env.ALLOWED_ORIGIN.split(',').map((o) => o.trim());
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86_400,
  }),
);

app.get('/api/health', (c) => c.json({ status: 'ok' }));
app.route('/api/track', trackRoute);

app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Route not found.'), 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(errorBody(err.code, err.message), err.status);
  }
  console.error('Unhandled error:', err);
  return c.json(errorBody('INTERNAL_ERROR', 'Something went wrong.'), 500);
});

export default app;
