import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { getDb } from './db/index.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { webhookRoutes } from './modules/webhooks/webhook.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : env.NODE_ENV === 'development'
          ? { transport: { target: 'pino-pretty' } }
          : true,
  });

  getDb(); // initialize schema eagerly

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGINS, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(authPlugin);

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => {
    getDb().prepare('SELECT 1').get();
    return { status: 'ready' };
  });

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(billingRoutes);
  await app.register(webhookRoutes);
  await app.register(adminRoutes);

  app.setErrorHandler((error: FastifyError, req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) req.log.error(error);
    reply.code(status).send({
      error: status >= 500 ? 'internal_error' : (error.code ?? 'error'),
      message: status >= 500 ? 'Something went wrong' : error.message,
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: 'not_found', message: `Route ${req.method} ${req.url} not found` });
  });

  return app;
}
