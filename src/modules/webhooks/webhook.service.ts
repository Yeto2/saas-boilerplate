import { getDb } from '../../db/index.js';
import { env } from '../../config/env.js';
import { upsertSubscription, type SubStatus } from '../billing/subscription.service.js';
import { findUserByCustomerId } from '../billing/billing.service.js';

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface WebhookResult {
  handled: boolean;
  duplicate: boolean;
}

/** Record the event id; returns false if it was already processed. */
function claimEvent(event: StripeEvent): boolean {
  const res = getDb()
    .prepare('INSERT OR IGNORE INTO processed_webhook_events (id, type) VALUES (?, ?)')
    .run(event.id, event.type);
  return res.changes > 0;
}

function mapStatus(stripeStatus: string): SubStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return stripeStatus;
    case 'unpaid':
      return 'past_due';
    case 'incomplete_expired':
      return 'incomplete';
    default:
      return 'incomplete';
  }
}

function userIdFor(obj: Record<string, unknown>): string | undefined {
  const customer = obj.customer as string | undefined;
  return customer ? findUserByCustomerId(customer) : undefined;
}

/**
 * Process a verified Stripe event. Idempotent: a repeated event id is a no-op.
 * The subscriptions table is written ONLY here.
 */
export function processEvent(event: StripeEvent): WebhookResult {
  if (!claimEvent(event)) return { handled: false, duplicate: true };

  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = userIdFor(obj);
      if (userId) {
        upsertSubscription({
          userId,
          stripeSubscriptionId: (obj.subscription as string) ?? null,
          stripePriceId: env.STRIPE_PRICE_PRO,
          tier: 'pro',
          status: 'active',
          currentPeriodEnd: (obj.current_period_end as number) ?? null,
        });
      }
      return { handled: Boolean(userId), duplicate: false };
    }

    case 'customer.subscription.updated': {
      const userId = userIdFor(obj);
      if (userId) {
        const status = mapStatus((obj.status as string) ?? 'active');
        const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end);
        const items = obj.items as { data?: { price?: { id?: string } }[] } | undefined;
        const priceId = items?.data?.[0]?.price?.id ?? env.STRIPE_PRICE_PRO;
        upsertSubscription({
          userId,
          stripeSubscriptionId: (obj.id as string) ?? null,
          stripePriceId: priceId,
          tier: status === 'canceled' ? 'free' : 'pro',
          status,
          currentPeriodEnd: (obj.current_period_end as number) ?? null,
          cancelAtPeriodEnd,
        });
      }
      return { handled: Boolean(userId), duplicate: false };
    }

    case 'customer.subscription.deleted': {
      const userId = userIdFor(obj);
      if (userId) {
        upsertSubscription({ userId, tier: 'free', status: 'canceled', cancelAtPeriodEnd: false });
      }
      return { handled: Boolean(userId), duplicate: false };
    }

    case 'invoice.payment_failed': {
      const userId = userIdFor(obj);
      if (userId) {
        const sub = getDb()
          .prepare('SELECT tier FROM subscriptions WHERE user_id = ?')
          .get(userId) as unknown as { tier: 'free' | 'pro' } | undefined;
        upsertSubscription({ userId, tier: sub?.tier ?? 'free', status: 'past_due' });
      }
      return { handled: Boolean(userId), duplicate: false };
    }

    default:
      return { handled: false, duplicate: false };
  }
}
