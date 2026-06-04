import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/index.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { issueNewSession, AuthError, type Role, type TokenPair } from './token.service.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: Role;
  email_verified: number;
  stripe_customer_id: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  emailVerified: boolean;
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    emailVerified: Boolean(u.email_verified),
  };
}

function findByEmail(email: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as unknown as
    | UserRow
    | undefined;
}

export function findById(id: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName?: string;
  role?: Role;
}

export function register(input: RegisterInput): { user: PublicUser } & TokenPair {
  const db = getDb();
  if (findByEmail(input.email)) throw new AuthError('Email already registered', 409);

  const id = randomUUID();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
  ).run(id, input.email.toLowerCase(), hashPassword(input.password), input.fullName ?? null, input.role ?? 'user');
  // Every user starts on the free tier; the subscriptions row is the mirror that
  // webhooks later update. Seeding it here keeps tier reads non-null.
  db.prepare('INSERT INTO subscriptions (user_id, tier, status) VALUES (?, ?, ?)').run(id, 'free', 'active');

  const user = findById(id)!;
  const tokens = issueNewSession(user.id, user.role);
  return { user: toPublicUser(user), ...tokens };
}

export function login(email: string, password: string): { user: PublicUser } & TokenPair {
  const user = findByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new AuthError('Invalid email or password', 401);
  }
  const tokens = issueNewSession(user.id, user.role);
  return { user: toPublicUser(user), ...tokens };
}
