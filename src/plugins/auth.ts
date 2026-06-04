import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyJwt, JwtError } from '../lib/jwt.js';
import { env } from '../config/env.js';
import type { Role } from '../modules/auth/token.service.js';
import { effectiveTier, type Tier } from '../modules/billing/subscription.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; role: Role };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTier: (tier: Tier) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
    }
    try {
      const payload = verifyJwt(header.slice(7), env.JWT_SECRET);
      req.user = { id: payload.sub, role: payload.role as Role };
    } catch (err) {
      const message = err instanceof JwtError ? err.message : 'Invalid token';
      return reply.code(401).send({ error: 'unauthorized', message });
    }
  });

  app.decorate('requireRole', (...roles: Role[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
      if (!roles.includes(req.user.role)) {
        return reply.code(403).send({ error: 'forbidden', message: 'Insufficient role' });
      }
    };
  });

  // Tier is read from the local subscriptions mirror (source: Stripe webhooks),
  // never from the access token — so a webhook upgrade takes effect without
  // forcing the user to re-login.
  app.decorate('requireTier', (tier: Tier) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
      if (tier === 'pro' && effectiveTier(req.user.id) !== 'pro') {
        return reply.code(402).send({ error: 'payment_required', message: 'Pro plan required' });
      }
    };
  });
});
