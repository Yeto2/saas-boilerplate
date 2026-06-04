import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4020),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z
    .string()
    // 3020 is the bundled SaaS UI (web/); 3000 kept for convenience.
    .default('http://localhost:3000,http://localhost:3020')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  DATABASE_FILE: z.string().default('./data/saas.sqlite'),
  JWT_SECRET: z.string().min(8).default('dev-only-change-me-to-a-long-random-secret'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  // Stripe is optional: when unset the billing endpoints run in a self-contained
  // "dev mode" so the reference is runnable without a real Stripe account.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_dev_local_secret'),
  STRIPE_PRICE_PRO: z.string().default('price_dev_pro'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;

export const stripeConfigured = Boolean(env.STRIPE_SECRET_KEY);
