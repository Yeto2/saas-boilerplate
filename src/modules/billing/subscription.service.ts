import { getDb } from '../../db/index.js';

export type Tier = 'free' | 'pro';
export type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

export interface SubscriptionRow {
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  tier: Tier;
  status: SubStatus;
  current_period_end: number | null;
  cancel_at_period_end: number;
  updated_at: string;
}

export function getSubscription(userId: string): SubscriptionRow | undefined {
  return getDb().prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as unknown as
    | SubscriptionRow
    | undefined;
}

/** Effective tier used for authorization: pro only while the sub is healthy. */
export function effectiveTier(userId: string): Tier {
  const sub = getSubscription(userId);
  if (!sub) return 'free';
  const healthy = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
  return sub.tier === 'pro' && healthy ? 'pro' : 'free';
}

export interface UpsertSubscription {
  userId: string;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  tier: Tier;
  status: SubStatus;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
}

/** Written ONLY by webhook handlers — Stripe is the source of truth. */
export function upsertSubscription(s: UpsertSubscription): void {
  getDb()
    .prepare(
      `INSERT INTO subscriptions
         (user_id, stripe_subscription_id, stripe_price_id, tier, status,
          current_period_end, cancel_at_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         stripe_subscription_id = excluded.stripe_subscription_id,
         stripe_price_id        = excluded.stripe_price_id,
         tier                   = excluded.tier,
         status                 = excluded.status,
         current_period_end     = excluded.current_period_end,
         cancel_at_period_end   = excluded.cancel_at_period_end,
         updated_at             = datetime('now')`,
    )
    .run(
      s.userId,
      s.stripeSubscriptionId ?? null,
      s.stripePriceId ?? null,
      s.tier,
      s.status,
      s.currentPeriodEnd ?? null,
      s.cancelAtPeriodEnd ? 1 : 0,
    );
}
