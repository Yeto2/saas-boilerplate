import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { env } from '../config/env.js';

/**
 * Built-in node:sqlite (Node 22+). SQLite stands in for PostgreSQL + Prisma in
 * this runnable reference; the schema mirrors the production design (README.md).
 */
let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  const file = process.env.DATABASE_FILE_OVERRIDE ?? env.DATABASE_FILE;
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                 TEXT PRIMARY KEY,
      email              TEXT UNIQUE NOT NULL,
      password_hash      TEXT NOT NULL,
      full_name          TEXT,
      role               TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      email_verified     INTEGER NOT NULL DEFAULT 0,
      stripe_customer_id TEXT UNIQUE,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Refresh-token rotation + reuse detection. Tokens belong to a "family";
    -- presenting a revoked token revokes the whole family (theft response).
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id   TEXT NOT NULL,
      token_hash  TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      revoked_at  TEXT,
      replaced_by TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rt_user   ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_rt_family ON refresh_tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_rt_hash   ON refresh_tokens(token_hash);

    -- Subscription mirror — written ONLY by Stripe webhook handlers.
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      stripe_subscription_id TEXT UNIQUE,
      stripe_price_id        TEXT,
      tier                   TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro')),
      status                 TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','trialing','past_due','canceled','incomplete')),
      current_period_end     INTEGER,
      cancel_at_period_end   INTEGER NOT NULL DEFAULT 0,
      updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Idempotency: never process the same Stripe event twice.
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Simple per-tier usage counters (demonstrates tier-gated metering).
    CREATE TABLE IF NOT EXISTS usage_counters (
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      metric    TEXT NOT NULL,
      period    TEXT NOT NULL,
      count     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, metric, period)
    );
  `);
  return db;
}

/** Test helper — reset the singleton so a fresh in-memory DB can be built. */
export function _resetDbForTests(): void {
  if (db) db.close();
  db = null;
}
