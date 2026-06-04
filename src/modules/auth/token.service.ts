import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { getDb } from '../../db/index.js';
import { signJwt } from '../../lib/jwt.js';
import { env } from '../../config/env.js';

export type Role = 'user' | 'admin';

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface RefreshRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: number;
  revoked_at: string | null;
  replaced_by: string | null;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

function issueAccessToken(userId: string, role: Role): string {
  return signJwt({ sub: userId, role }, env.JWT_SECRET, env.JWT_ACCESS_TTL_SECONDS);
}

/** Create a refresh token row (optionally continuing an existing family). */
function createRefreshToken(userId: string, familyId: string): string {
  const raw = randomBytes(32).toString('hex');
  const id = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + env.JWT_REFRESH_TTL_SECONDS;
  getDb()
    .prepare(
      'INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, userId, familyId, sha256(raw), expiresAt);
  // Encode the row id alongside the secret so rotation can link replaced_by.
  return `${id}.${raw}`;
}

/** Fresh login: start a brand-new token family. */
export function issueNewSession(userId: string, role: Role): TokenPair {
  const familyId = randomUUID();
  return {
    accessToken: issueAccessToken(userId, role),
    refreshToken: createRefreshToken(userId, familyId),
    accessExpiresIn: env.JWT_ACCESS_TTL_SECONDS,
  };
}

function revokeFamily(familyId: string): void {
  getDb()
    .prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE family_id = ? AND revoked_at IS NULL")
    .run(familyId);
}

function loadRow(refreshToken: string): RefreshRow | undefined {
  const [id] = refreshToken.split('.');
  if (!id) return undefined;
  return getDb().prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(id) as unknown as
    | RefreshRow
    | undefined;
}

/**
 * Rotate a refresh token. On success the presented token is revoked and a new
 * one (same family) is returned. If a token that was ALREADY revoked is
 * presented again, that signals theft → the whole family is revoked.
 */
export function rotate(refreshToken: string): TokenPair {
  const db = getDb();
  const row = loadRow(refreshToken);
  if (!row) throw new AuthError('Invalid refresh token', 401);

  const [, raw] = refreshToken.split('.');
  if (!raw || sha256(raw) !== row.token_hash) throw new AuthError('Invalid refresh token', 401);

  if (row.revoked_at) {
    // Reuse of a revoked token — revoke the entire family and force re-login.
    revokeFamily(row.family_id);
    throw new AuthError('Refresh token reuse detected; session revoked', 401);
  }
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    throw new AuthError('Refresh token expired', 401);
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(row.user_id) as unknown as
    | { role: Role }
    | undefined;
  if (!user) throw new AuthError('Invalid refresh token', 401);

  const newToken = createRefreshToken(row.user_id, row.family_id);
  const [newId] = newToken.split('.');
  db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now'), replaced_by = ? WHERE id = ?").run(
    newId,
    row.id,
  );

  return {
    accessToken: issueAccessToken(row.user_id, user.role),
    refreshToken: newToken,
    accessExpiresIn: env.JWT_ACCESS_TTL_SECONDS,
  };
}

/** Logout: revoke a single presented refresh token (and its family). */
export function revoke(refreshToken: string): void {
  const row = loadRow(refreshToken);
  if (row) revokeFamily(row.family_id);
}
