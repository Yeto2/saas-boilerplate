# Project 2 — SaaS Authentication + Subscription Boilerplate

A reusable SaaS foundation: secure auth with rotating refresh tokens, role-based
access control, and Stripe subscriptions kept in perfect sync with your database
via webhooks. This is the base you clone to launch a new SaaS product in a day
instead of a month.

> **Positioning:** "This is what I reuse for every SaaS product." Clients buying
> this want speed-to-market plus correctness on the two things that are easy to
> get wrong: token security and billing state.

---

## Runnable reference implementation

This repo ships with a **working, tested** backend in `src/` (Fastify + TypeScript).
The design below describes the production stack (NestJS + Postgres + Stripe); the
runnable reference keeps the exact same security model while staying
dependency-light so it runs with no external services:

| Production (design) | Runnable reference | Swap point |
|---------------------|--------------------|-----------|
| PostgreSQL + Prisma | Node's built-in `node:sqlite` | `src/db/index.ts` |
| Live Stripe account | Env-gated: real Stripe via `fetch` when `STRIPE_SECRET_KEY` is set, else a self-contained dev mode | `src/modules/billing/billing.service.ts` |
| Stripe SDK signature check | `node:crypto` HMAC matching Stripe's documented scheme | `src/lib/stripe-signature.ts` |

The parts that are easy to get wrong are implemented for real and covered by tests:
**refresh-token rotation with reuse detection** (a replayed token revokes the
whole family) and **idempotent, signature-verified webhooks** that are the *only*
writer of subscription state.

```bash
npm install        # standalone package: use --no-workspaces if nested in a monorepo
npm test           # node:test — token rotation/reuse, tier gate (402), webhook idempotency, RBAC
npm run dev        # http://localhost:4020
# or: docker build -t saas-boilerplate . && docker run -p 4020:4020 saas-boilerplate
```

---

## Overview

Built with **NestJS** (chosen here for its module/guard/interceptor structure,
which makes RBAC and Stripe webhook handling clean and testable). PostgreSQL +
Prisma for data, Redis for rate limiting and refresh-token denylist.

The product models a classic freemium SaaS: anonymous → registered (free tier) →
paying (pro tier), with billing fully driven by Stripe as the source of truth and
mirrored locally for fast authorization checks.

---

## Features

| Area | Detail |
|------|--------|
| Auth | Email/password, JWT **access** (short-lived) + **refresh** (rotating) |
| Token security | Refresh tokens hashed at rest, rotated on use, reuse-detection revokes the family |
| RBAC | Roles (`user`, `admin`) + permission guards; tier gates (`free`, `pro`) |
| Billing | Stripe Checkout, Billing Portal, subscription webhooks → DB sync |
| Dashboard | Profile, current plan, usage, billing history endpoints |
| Security | Rate limiting (Redis), Helmet headers, input validation, CORS allowlist |
| Email | Verification + password reset (transactional, provider-agnostic) |

---

## Architecture

```
   Client (Next.js)
        │  access token (15 min)  +  refresh token (httpOnly cookie, 7 days)
        ▼
┌───────────────────────────────────────────────┐
│                NestJS API                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ AuthGuard │  │RolesGuard│  │ TierGuard     │  │  ← request pipeline
│  └──────────┘  └──────────┘  └──────────────┘  │
│  Modules: Auth · Users · Billing · Webhooks    │
└───────┬───────────────────┬───────────────┬────┘
        ▼                   ▼               ▼
 ┌────────────┐      ┌────────────┐   ┌──────────────┐
 │ PostgreSQL │      │   Redis     │   │   Stripe      │
 │ (Prisma)   │      │ rate-limit  │   │ Checkout +    │
 │            │      │ token deny  │   │ Billing +     │
 └────────────┘      └────────────┘   │ Webhooks      │
                                       └──────────────┘
```

**Two decisions worth calling out:**

1. **Refresh-token rotation with reuse detection.** Each refresh issues a new
   token and revokes the old one. Tokens are grouped into a "family." If a
   *revoked* token is ever presented again (sign of theft), the entire family is
   revoked, forcing re-login. This is the OWASP-recommended pattern and the thing
   most boilerplates skip.

2. **Stripe is the source of truth; the DB is a synced mirror.** Authorization
   reads the local `subscriptions` table (fast, no Stripe API call per request),
   but that table is only ever written by **webhook handlers**. Checkout success
   alone never grants access — we wait for `checkout.session.completed` /
   `customer.subscription.updated`. This eliminates the classic "paid but no
   access" and "cancelled but still has access" bugs.

---

## Database Schema

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refresh-token rotation + reuse detection
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL,                 -- groups a rotation chain
  token_hash  TEXT NOT NULL,                 -- SHA-256 of the token
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,                   -- set on rotation or on reuse
  replaced_by UUID REFERENCES refresh_tokens(id),
  user_agent  TEXT,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rt_user   ON refresh_tokens(user_id);
CREATE INDEX idx_rt_family ON refresh_tokens(family_id);

-- Subscription mirror — written ONLY by Stripe webhooks
CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id        TEXT,
  tier                   TEXT NOT NULL DEFAULT 'free'
                           CHECK (tier IN ('free','pro')),
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','trialing','past_due',
                                             'canceled','incomplete')),
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: never process the same Stripe event twice
CREATE TABLE processed_webhook_events (
  id          TEXT PRIMARY KEY,             -- Stripe event id (evt_...)
  type        TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
```

---

## Stripe Flow (text diagram)

### Subscribe (free → pro)
```
1. User clicks "Upgrade" in dashboard
2. API: POST /billing/checkout
      → ensure user has stripe_customer_id (create if missing)
      → create Stripe Checkout Session (mode=subscription, price=pro)
      → return session.url
3. Browser redirects to Stripe-hosted Checkout
4. User pays on Stripe (we never touch card data — PCI scope stays with Stripe)
5. Stripe redirects back to /billing/success  (UI shows "processing…")
6. ASYNC — Stripe sends webhook: checkout.session.completed
      → verify signature
      → check processed_webhook_events (idempotency)
      → upsert subscriptions row: tier=pro, status=active, period_end
7. Next request: TierGuard reads local subscriptions row → access granted
```
**Key point:** access is granted by step 6 (webhook), *not* step 5 (redirect).
The redirect can be lost, spoofed, or arrive before the webhook — only the
signed webhook is trusted.

### Manage / cancel
```
1. User clicks "Manage billing"
2. API: POST /billing/portal → create Billing Portal session → redirect
3. User cancels / updates card on Stripe-hosted portal
4. Webhook customer.subscription.updated (cancel_at_period_end=true)
      → DB updated; user keeps pro until current_period_end
5. At period end: customer.subscription.deleted → tier=free
```

### Webhooks consumed
```
checkout.session.completed        → activate subscription
customer.subscription.updated     → plan/status/period changes
customer.subscription.deleted     → downgrade to free
invoice.payment_failed            → status=past_due (optionally email + grace)
```

---

## API Endpoints

```
# Auth
POST   /auth/register             { email, password, fullName }
POST   /auth/verify-email         { token }
POST   /auth/login                → { accessToken } + httpOnly refresh cookie
POST   /auth/refresh              (reads refresh cookie) → rotated pair
POST   /auth/logout               revoke current refresh token
POST   /auth/forgot-password      { email }
POST   /auth/reset-password       { token, newPassword }

# User / dashboard
GET    /me                        profile + role + tier
PATCH  /me                        update profile
GET    /me/subscription          current plan, status, renewal date
GET    /me/usage                  tier-gated usage counters

# Billing
POST   /billing/checkout          create Checkout session (→ Stripe URL)
POST   /billing/portal            create Billing Portal session
POST   /webhooks/stripe           Stripe events (raw body, signature-verified)

# Admin (RolesGuard: admin)
GET    /admin/users               list/search users
PATCH  /admin/users/:id/role      change role
GET    /admin/metrics             MRR, active subs, churn snapshot
```

**Guard pipeline example** — a pro-only endpoint:
```ts
@UseGuards(AuthGuard, TierGuard)
@RequireTier('pro')
@Get('reports/advanced')
getAdvancedReports() { ... }   // 402 Payment Required if free tier
```

---

## Security Basics (included by default)

- **Rate limiting** (Redis sliding window): aggressive on `/auth/*`, lenient
  elsewhere; per-IP and per-account.
- **Password hashing**: Argon2id (or bcrypt cost ≥ 12).
- **Helmet** security headers + strict CORS allowlist from env.
- **Validation**: every DTO validated with `class-validator`; reject unknown props.
- **Webhook safety**: raw-body signature verification + idempotency table.
- **No secrets in tokens**: access JWT carries only `sub`, `role`, `tier`.
- **httpOnly + Secure + SameSite** cookie for the refresh token (not localStorage).

---

## Environment Setup

```bash
# .env.example
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://user:pass@postgres:5432/saas
REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=...
JWT_REFRESH_TTL=7d

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...

CORS_ORIGINS=https://app.example.com
MAIL_PROVIDER_API_KEY=...
```

```bash
# First run
cp .env.example .env
docker compose up -d postgres redis
npx prisma migrate deploy
npm run start:prod
# Stripe local testing:
stripe listen --forward-to localhost:4000/webhooks/stripe
```

---

## Folder Structure

```
saas-boilerplate/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── guards/              # auth.guard, roles.guard, tier.guard
│   │   ├── decorators/         # @RequireTier, @Roles, @CurrentUser
│   │   ├── interceptors/       # logging, transform
│   │   └── filters/            # global exception filter
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts     # login, register, password reset
│   │   ├── token.service.ts    # issue/rotate/revoke, reuse detection
│   │   └── strategies/         # jwt access + refresh
│   ├── users/
│   ├── billing/
│   │   ├── billing.service.ts  # checkout + portal sessions
│   │   └── billing.controller.ts
│   ├── webhooks/
│   │   └── stripe-webhook.controller.ts  # raw body, idempotent handlers
│   └── config/                 # zod-validated env loader
├── test/
│   ├── token-rotation.e2e-spec.ts
│   └── stripe-webhook.e2e-spec.ts
└── frontend/                   # Next.js dashboard (login, billing, settings)
```

---

## Deployment-Ready Notes

- Single multi-stage Dockerfile (build → slim runtime), non-root user.
- `prisma migrate deploy` runs as a release step, not at container boot.
- Stripe webhook endpoint must receive the **raw** body — body parser is disabled
  for that one route so signature verification works.
- Horizontal-scale safe: all state is in Postgres/Redis/Stripe, app is stateless.
