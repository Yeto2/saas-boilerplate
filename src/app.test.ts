import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';

process.env.DATABASE_FILE_OVERRIDE = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
process.env.STRIPE_PRICE_PRO = 'price_test_pro';
// STRIPE_SECRET_KEY intentionally unset → billing runs in self-contained dev mode.

const { buildApp } = await import('./app.js');
const { getDb } = await import('./db/index.js');
const { signStripePayload } = await import('./lib/stripe-signature.js');

const app = await buildApp();
let baseUrl: string;

before(async () => {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await app.close();
});

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function register(email: string) {
  return api('POST', '/auth/register', { email, password: 'password123', fullName: 'Test User' });
}

async function postWebhook(event: unknown) {
  const raw = JSON.stringify(event);
  const sig = signStripePayload(raw, process.env.STRIPE_WEBHOOK_SECRET!);
  const res = await fetch(`${baseUrl}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': sig },
    body: raw,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('refresh token rotates; reusing a revoked token revokes the family', async () => {
  const u = await register('rotate@example.com');
  assert.equal(u.status, 201);
  const token1 = u.body.refreshToken as string;

  const r1 = await api('POST', '/auth/refresh', { refreshToken: token1 });
  assert.equal(r1.status, 200);
  const token2 = r1.body.refreshToken as string;
  assert.notEqual(token1, token2);

  // Reusing the now-revoked token1 must fail AND revoke the whole family.
  const reuse = await api('POST', '/auth/refresh', { refreshToken: token1 });
  assert.equal(reuse.status, 401);

  // token2 belonged to the same family → it is now revoked too.
  const r2 = await api('POST', '/auth/refresh', { refreshToken: token2 });
  assert.equal(r2.status, 401);
});

test('tier gate: free user gets 402, pro access granted only after webhook', async () => {
  const u = await register('tier@example.com');
  const access = u.body.accessToken as string;
  const userId = u.body.user.id as string;

  // Free tier → 402 Payment Required.
  const denied = await api('GET', '/reports/advanced', undefined, access);
  assert.equal(denied.status, 402);

  // Start checkout → assigns a (dev) Stripe customer id.
  const checkout = await api('POST', '/billing/checkout', {}, access);
  assert.equal(checkout.status, 200);
  assert.equal(checkout.body.mode, 'dev');

  const customerId = `cus_dev_${userId.slice(0, 8)}`;
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;

  const wh = await postWebhook({
    id: 'evt_checkout_1',
    type: 'checkout.session.completed',
    data: { object: { customer: customerId, subscription: 'sub_1', current_period_end: periodEnd } },
  });
  assert.equal(wh.status, 200);
  assert.equal(wh.body.handled, true);

  // Now pro access is granted (tier read from the synced subscriptions mirror).
  const allowed = await api('GET', '/reports/advanced', undefined, access);
  assert.equal(allowed.status, 200);

  const sub = await api('GET', '/me/subscription', undefined, access);
  assert.equal(sub.body.tier, 'pro');
});

test('webhook idempotency: a duplicate event id is a no-op', async () => {
  const u = await register('idem@example.com');
  const access = u.body.accessToken as string;
  const userId = u.body.user.id as string;
  await api('POST', '/billing/checkout', {}, access);
  const customerId = `cus_dev_${userId.slice(0, 8)}`;

  const event = {
    id: 'evt_dupe_1',
    type: 'checkout.session.completed',
    data: { object: { customer: customerId, subscription: 'sub_dupe' } },
  };
  const first = await postWebhook(event);
  assert.equal(first.body.duplicate, false);
  const second = await postWebhook(event);
  assert.equal(second.body.duplicate, true);
});

test('webhook rejects an invalid signature', async () => {
  const raw = JSON.stringify({ id: 'evt_bad', type: 'checkout.session.completed', data: { object: {} } });
  const res = await fetch(`${baseUrl}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
    body: raw,
  });
  assert.equal(res.status, 400);
});

test('subscription deleted downgrades back to free', async () => {
  const u = await register('downgrade@example.com');
  const access = u.body.accessToken as string;
  const userId = u.body.user.id as string;
  await api('POST', '/billing/checkout', {}, access);
  const customerId = `cus_dev_${userId.slice(0, 8)}`;

  await postWebhook({
    id: 'evt_up_2',
    type: 'checkout.session.completed',
    data: { object: { customer: customerId, subscription: 'sub_2' } },
  });
  assert.equal((await api('GET', '/reports/advanced', undefined, access)).status, 200);

  await postWebhook({
    id: 'evt_del_2',
    type: 'customer.subscription.deleted',
    data: { object: { customer: customerId, id: 'sub_2' } },
  });
  assert.equal((await api('GET', '/reports/advanced', undefined, access)).status, 402);
});

test('RBAC: non-admin is forbidden from admin routes; admin allowed', async () => {
  const u = await register('rbac@example.com');
  const forbidden = await api('GET', '/admin/metrics', undefined, u.body.accessToken);
  assert.equal(forbidden.status, 403);

  // Promote to admin directly (as a seed/back-office action would), then log in
  // again to mint an access token carrying the admin role.
  getDb().prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.body.user.id);
  const relogin = await api('POST', '/auth/login', { email: 'rbac@example.com', password: 'password123' });
  const metrics = await api('GET', '/admin/metrics', undefined, relogin.body.accessToken);
  assert.equal(metrics.status, 200);
  assert.ok(typeof metrics.body.totalUsers === 'number');
});
