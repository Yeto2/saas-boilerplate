import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/index.js';

const RoleSchema = z.object({ role: z.enum(['user', 'admin']) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = { preHandler: [app.authenticate, app.requireRole('admin')] };

  app.get('/admin/users', adminOnly, async (req) => {
    const q = (req.query as { search?: string }).search;
    const db = getDb();
    const rows = q
      ? db
          .prepare(
            `SELECT u.id, u.email, u.role, u.created_at, s.tier, s.status
             FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
             WHERE u.email LIKE ? ORDER BY u.created_at DESC LIMIT 100`,
          )
          .all(`%${q}%`)
      : db
          .prepare(
            `SELECT u.id, u.email, u.role, u.created_at, s.tier, s.status
             FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
             ORDER BY u.created_at DESC LIMIT 100`,
          )
          .all();
    return { users: rows };
  });

  app.patch('/admin/users/:id/role', adminOnly, async (req, reply) => {
    const parsed = RoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'validation_error', fields: parsed.error.flatten().fieldErrors });
    }
    const { id } = req.params as { id: string };
    const res = getDb()
      .prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?")
      .run(parsed.data.role, id);
    if (res.changes === 0) return reply.code(404).send({ error: 'not_found' });
    return { id, role: parsed.data.role };
  });

  app.get('/admin/metrics', adminOnly, async () => {
    const db = getDb();
    const totalUsers = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
    const proSubs = (
      db
        .prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE tier = 'pro' AND status IN ('active','trialing','past_due')")
        .get() as { c: number }
    ).c;
    const pastDue = (
      db.prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'past_due'").get() as { c: number }
    ).c;
    return { totalUsers, activeProSubscriptions: proSubs, pastDue };
  });
}
