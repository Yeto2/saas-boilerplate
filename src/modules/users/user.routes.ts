import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { findById, toPublicUser } from '../auth/auth.service.js';
import { getSubscription, effectiveTier } from '../billing/subscription.service.js';

const UpdateMeSchema = z.object({ fullName: z.string().min(1).max(120) });

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: app.authenticate }, async (req, reply) => {
    const user = findById(req.user!.id);
    if (!user) return reply.code(404).send({ error: 'not_found' });
    return { ...toPublicUser(user), tier: effectiveTier(user.id) };
  });

  app.patch('/me', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = UpdateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', fields: parsed.error.flatten().fieldErrors });
    }
    getDb()
      .prepare("UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(parsed.data.fullName, req.user!.id);
    return { ...toPublicUser(findById(req.user!.id)!), tier: effectiveTier(req.user!.id) };
  });

  app.get('/me/subscription', { preHandler: app.authenticate }, async (req) => {
    const sub = getSubscription(req.user!.id);
    return {
      tier: effectiveTier(req.user!.id),
      status: sub?.status ?? 'active',
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
    };
  });

  app.get('/me/usage', { preHandler: app.authenticate }, async (req) => {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    const rows = getDb()
      .prepare('SELECT metric, count FROM usage_counters WHERE user_id = ? AND period = ?')
      .all(req.user!.id, period) as unknown as { metric: string; count: number }[];
    return { period, metrics: rows };
  });

  // Pro-only example endpoint — TierGuard returns 402 for free-tier users.
  app.get(
    '/reports/advanced',
    { preHandler: [app.authenticate, app.requireTier('pro')] },
    async (req) => {
      const period = new Date().toISOString().slice(0, 7);
      getDb()
        .prepare(
          `INSERT INTO usage_counters (user_id, metric, period, count) VALUES (?, 'advanced_reports', ?, 1)
           ON CONFLICT(user_id, metric, period) DO UPDATE SET count = count + 1`,
        )
        .run(req.user!.id, period);
      return { report: 'advanced', generatedAt: new Date().toISOString() };
    },
  );
}
