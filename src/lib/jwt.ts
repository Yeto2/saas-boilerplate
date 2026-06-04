import { createHmac, timingSafeEqual } from 'node:crypto';

/** Minimal HS256 JWT implementation (no external dependency). */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface JwtPayload {
  sub: string;
  role: string;
  [key: string]: unknown;
}

export function signJwt(payload: JwtPayload, secret: string, ttlSeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const encHeader = base64url(JSON.stringify(header));
  const encBody = base64url(JSON.stringify(body));
  const data = `${encHeader}.${encBody}`;
  const sig = base64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export class JwtError extends Error {}

export function verifyJwt(token: string, secret: string): JwtPayload & { iat: number; exp: number } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('malformed token');
  const [encHeader, encBody, encSig] = parts;
  const data = `${encHeader}.${encBody}`;
  const expected = createHmac('sha256', secret).update(data).digest();
  const actual = base64urlDecode(encSig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new JwtError('invalid signature');
  }
  const payload = JSON.parse(base64urlDecode(encBody).toString('utf8'));
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new JwtError('token expired');
  }
  return payload;
}
