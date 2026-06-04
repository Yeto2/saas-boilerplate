export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4020';

// --- Types mirrored from the backend -------------------------------------

export type Role = 'user' | 'admin';
export type Tier = 'free' | 'pro';
export type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  emailVerified: boolean;
  tier: Tier;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export interface Subscription {
  tier: Tier;
  status: SubStatus;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export interface Usage {
  period: string;
  metrics: { metric: string; count: number }[];
}

export interface BillingConfig {
  stripeConfigured: boolean;
}

export interface CheckoutResult {
  url: string;
  mode: 'stripe' | 'dev';
  sessionId: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  tier: Tier | null;
  status: SubStatus | null;
}

export interface AdminMetrics {
  totalUsers: number;
  activeProSubscriptions: number;
  pastDue: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Decode the payload of a self-contained HS256 JWT (no verification — display only). */
export function decodeJwt(token: string): { sub: string; role: Role; exp: number } | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Low-level request. `token` adds a Bearer header; throws ApiError on non-2xx. */
export async function rawRequest<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['content-type'] = 'application/json';
  if (init.token) headers['authorization'] = `Bearer ${init.token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: 'no-store' });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { message?: string; error?: string }).message
      ?? (body as { error?: string }).error
      ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

// --- Unauthenticated auth endpoints --------------------------------------

export const registerRequest = (email: string, password: string, fullName?: string) =>
  rawRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, ...(fullName ? { fullName } : {}) }),
  });

export const loginRequest = (email: string, password: string) =>
  rawRequest<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const refreshRequest = (refreshToken: string) =>
  rawRequest<TokenResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });

export const logoutRequest = (refreshToken: string) =>
  rawRequest<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
