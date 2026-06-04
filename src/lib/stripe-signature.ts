import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe webhook signature verification, implemented from the documented scheme
 * so the reference is runnable/testable without the Stripe SDK. Stripe signs the
 * raw body as HMAC-SHA256 over `${timestamp}.${payload}` and sends it in the
 * `Stripe-Signature` header as `t=<ts>,v1=<sig>`.
 */

export class WebhookSignatureError extends Error {}

const DEFAULT_TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (!header) throw new WebhookSignatureError('Missing Stripe-Signature header');

  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k.trim(), v];
    }),
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) throw new WebhookSignatureError('Malformed signature header');

  const age = Math.abs(nowSeconds - Number(timestamp));
  if (Number.isNaN(Number(timestamp)) || age > toleranceSeconds) {
    throw new WebhookSignatureError('Signature timestamp outside tolerance');
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const actual = Buffer.from(signature, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new WebhookSignatureError('Signature mismatch');
  }
}

/** Test/dev helper: produce a valid Stripe-Signature header for a raw body. */
export function signStripePayload(
  rawBody: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
