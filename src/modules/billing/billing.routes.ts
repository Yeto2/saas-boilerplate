import type { FastifyInstance } from 'fastify';
import { createCheckoutSession, createPortalSession } from './billing.service.js';
import { upsertSubscription } from './subscription.service.js';
import { env, stripeConfigured } from '../../config/env.js';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/billing/checkout', { preHandler: app.authenticate }, async (req) => {
    return createCheckoutSession(req.user!.id);
  });

  app.post('/billing/portal', { preHandler: app.authenticate }, async (req) => {
    return createPortalSession(req.user!.id);
  });

  app.get('/billing/config', { preHandler: app.authenticate }, async () => {
    return { stripeConfigured };
  });

  // --- Dev-only checkout simulation ---------------------------------------
  // With real Stripe, the subscription is granted by the `checkout.session.
  // completed` webhook (signature-verified, so a browser cannot forge it). In
  // dev mode there is no Stripe to call that webhook back, so these two routes
  // let the UI complete an upgrade/cancel locally. They mirror exactly what the
  // webhook handler writes and are HARD-GATED to dev mode — when STRIPE_SECRET_KEY
  // is set, they return 404 and the real webhook is the only source of truth.
  if (!stripeConfigured) {
    app.post('/billing/dev/complete', { preHandler: app.authenticate }, async (req) => {
      upsertSubscription({
        userId: req.user!.id,
        stripeSubscriptionId: `sub_dev_${req.user!.id.slice(0, 8)}`,
        stripePriceId: env.STRIPE_PRICE_PRO,
        tier: 'pro',
        status: 'active',
        currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        cancelAtPeriodEnd: false,
      });
      return { ok: true, tier: 'pro' };
    });

    app.post('/billing/dev/cancel', { preHandler: app.authenticate }, async (req) => {
      upsertSubscription({ userId: req.user!.id, tier: 'free', status: 'canceled', cancelAtPeriodEnd: false });
      return { ok: true, tier: 'free' };
    });
  }
}
