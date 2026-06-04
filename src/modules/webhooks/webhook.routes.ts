import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { verifyStripeSignature, WebhookSignatureError } from '../../lib/stripe-signature.js';
import { processEvent, type StripeEvent } from './webhook.service.js';

/**
 * Stripe webhooks need the RAW request body for signature verification, so this
 * route registers its own content-type parser that keeps the body as a string.
 * Content-type parsers are encapsulated in Fastify, so this does not affect the
 * JSON parsing used by the rest of the API.
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/webhooks/stripe', async (req, reply) => {
    const rawBody = typeof req.body === 'string' ? req.body : '';
    const signature = req.headers['stripe-signature'] as string | undefined;

    try {
      verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      const message = err instanceof WebhookSignatureError ? err.message : 'Invalid signature';
      return reply.code(400).send({ error: 'invalid_signature', message });
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return reply.code(400).send({ error: 'invalid_payload' });
    }
    if (!event?.id || !event?.type) {
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    const result = processEvent(event);
    return reply.code(200).send({ received: true, ...result });
  });
}
