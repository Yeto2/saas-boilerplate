import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signStripePayload, verifyStripeSignature, WebhookSignatureError } from './stripe-signature.js';

const SECRET = 'whsec_test_secret';

test('valid signature passes verification', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'x' });
  const header = signStripePayload(body, SECRET);
  assert.doesNotThrow(() => verifyStripeSignature(body, header, SECRET));
});

test('tampered body fails verification', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'x' });
  const header = signStripePayload(body, SECRET);
  assert.throws(() => verifyStripeSignature(body + 'tamper', header, SECRET), WebhookSignatureError);
});

test('wrong secret fails verification', () => {
  const body = JSON.stringify({ id: 'evt_1' });
  const header = signStripePayload(body, SECRET);
  assert.throws(() => verifyStripeSignature(body, header, 'whsec_other'), WebhookSignatureError);
});

test('stale timestamp fails verification', () => {
  const body = JSON.stringify({ id: 'evt_1' });
  const old = Math.floor(Date.now() / 1000) - 10_000;
  const header = signStripePayload(body, SECRET, old);
  assert.throws(() => verifyStripeSignature(body, header, SECRET), WebhookSignatureError);
});

test('missing header fails verification', () => {
  assert.throws(() => verifyStripeSignature('{}', undefined, SECRET), WebhookSignatureError);
});
