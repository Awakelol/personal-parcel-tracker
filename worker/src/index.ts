import { Hono } from 'hono';
import type { Account } from '../../shared/api';
import type { AppBindings } from './env';
import { AppError, errorBody } from './errors';
import { requireUser } from './lib/auth';
import { parcelsRoute } from './routes/parcels';
import { trackRoute } from './routes/track';

const app = new Hono<AppBindings>();

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.use('/api/*', requireUser);
app.get('/api/me', (c) => c.json<Account>({ email: c.get('user').email }));
app.route('/api/track', trackRoute);
app.route('/api/parcels', parcelsRoute);

app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Route not found.'), 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(errorBody(err.code, err.message), err.status);
  }
  console.error('Unhandled error:', err);
  return c.json(errorBody('INTERNAL_ERROR', 'Something went wrong.'), 500);
});

export default app;
