import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.js';
import { env, stripeConfigured } from '../../config/env.js';
import { findById } from '../auth/auth.service.js';

export class BillingError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function stripeApi(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new BillingError(err?.message ?? 'Stripe API error', 502);
  }
  return json;
}

/** Ensure the user has a Stripe customer id (real or dev-stub), persisted. */
async function ensureCustomer(userId: string): Promise<string> {
  const user = findById(userId);
  if (!user) throw new BillingError('User not found', 404);
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customerId = stripeConfigured
    ? ((await stripeApi('customers', { email: user.email })).id as string)
    : `cus_dev_${userId.slice(0, 8)}`;

  getDb()
    .prepare("UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(customerId, userId);
  return customerId;
}

export interface CheckoutResult {
  url: string;
  mode: 'stripe' | 'dev';
  sessionId: string;
}

export async function createCheckoutSession(userId: string): Promise<CheckoutResult> {
  const customerId = await ensureCustomer(userId);

  if (!stripeConfigured) {
    // Dev mode: no real Stripe. The frontend would normally redirect to Stripe;
    // here we return a local URL and rely on a simulated webhook to grant access.
    return {
      url: `${env.APP_BASE_URL}/billing/success?dev=1`,
      mode: 'dev',
      sessionId: `cs_dev_${randomUUID()}`,
    };
  }

  const session = await stripeApi('checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': env.STRIPE_PRICE_PRO,
    'line_items[0][quantity]': '1',
    success_url: `${env.APP_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_BASE_URL}/billing/cancel`,
  });
  return { url: session.url as string, mode: 'stripe', sessionId: session.id as string };
}

export async function createPortalSession(userId: string): Promise<{ url: string; mode: 'stripe' | 'dev' }> {
  const customerId = await ensureCustomer(userId);
  if (!stripeConfigured) {
    return { url: `${env.APP_BASE_URL}/billing/portal?dev=1`, mode: 'dev' };
  }
  const session = await stripeApi('billing_portal/sessions', {
    customer: customerId,
    return_url: `${env.APP_BASE_URL}/dashboard`,
  });
  return { url: session.url as string, mode: 'stripe' };
}

/** Resolve a Stripe customer id back to our local user id (webhook routing). */
export function findUserByCustomerId(customerId: string): string | undefined {
  const row = getDb()
    .prepare('SELECT id FROM users WHERE stripe_customer_id = ?')
    .get(customerId) as unknown as { id: string } | undefined;
  return row?.id;
}
