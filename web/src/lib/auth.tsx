'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AdminMetrics,
  type AdminUser,
  type AuthResponse,
  type BillingConfig,
  type CheckoutResult,
  type PublicUser,
  type Subscription,
  type Usage,
  ApiError,
  API_BASE,
  loginRequest,
  logoutRequest,
  refreshRequest,
  registerRequest,
} from './api';

const ACCESS_KEY = 'saas.access';
const REFRESH_KEY = 'saas.refresh';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // Typed API bound to the current session (auto-refreshes the access token).
  api: {
    getSubscription: () => Promise<Subscription>;
    getUsage: () => Promise<Usage>;
    getAdvancedReport: () => Promise<{ report: string; generatedAt: string }>;
    updateName: (fullName: string) => Promise<PublicUser>;
    billingConfig: () => Promise<BillingConfig>;
    checkout: () => Promise<CheckoutResult>;
    portal: () => Promise<{ url: string; mode: 'stripe' | 'dev' }>;
    devComplete: () => Promise<{ ok: boolean; tier: string }>;
    devCancel: () => Promise<{ ok: boolean; tier: string }>;
    adminUsers: (search?: string) => Promise<AdminUser[]>;
    adminMetrics: () => Promise<AdminMetrics>;
    setUserRole: (id: string, role: 'user' | 'admin') => Promise<void>;
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const accessRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);

  const persist = useCallback((access: string, refresh: string) => {
    accessRef.current = access;
    refreshTokenRef.current = refresh;
    window.localStorage.setItem(ACCESS_KEY, access);
    window.localStorage.setItem(REFRESH_KEY, refresh);
  }, []);

  const clear = useCallback(() => {
    accessRef.current = null;
    refreshTokenRef.current = null;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    setUser(null);
  }, []);

  // Rotate the access token using the stored refresh token. Single-flight so
  // concurrent 401s trigger only one refresh. Returns whether it succeeded.
  const doRefresh = useCallback((): Promise<boolean> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const rt = refreshTokenRef.current;
    if (!rt) return Promise.resolve(false);
    const p = refreshRequest(rt)
      .then((tokens) => {
        persist(tokens.accessToken, tokens.refreshToken);
        return true;
      })
      .catch(() => {
        clear();
        return false;
      })
      .finally(() => {
        refreshInFlight.current = null;
      });
    refreshInFlight.current = p;
    return p;
  }, [persist, clear]);

  // Authenticated fetch with one transparent refresh-and-retry on 401.
  const authedFetch = useCallback(
    async <T,>(path: string, init: RequestInit = {}, retry = true): Promise<T> => {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
      if (init.body) headers['content-type'] = 'application/json';
      if (accessRef.current) headers['authorization'] = `Bearer ${accessRef.current}`;

      const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: 'no-store' });
      if (res.status === 401 && retry) {
        const ok = await doRefresh();
        if (ok) return authedFetch<T>(path, init, false);
      }
      if (res.status === 204) return undefined as T;
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body as { message?: string; error?: string }).message
          ?? (body as { error?: string }).error
          ?? `Request failed (${res.status})`;
        throw new ApiError(msg, res.status);
      }
      return body as T;
    },
    [doRefresh],
  );

  const refreshUser = useCallback(async () => {
    if (!accessRef.current) return;
    try {
      const me = await authedFetch<PublicUser>('/me');
      setUser(me);
    } catch {
      clear();
    }
  }, [authedFetch, clear]);

  // Restore a session on first load.
  useEffect(() => {
    const access = window.localStorage.getItem(ACCESS_KEY);
    const refresh = window.localStorage.getItem(REFRESH_KEY);
    accessRef.current = access;
    refreshTokenRef.current = refresh;
    if (access) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The /auth response's user object does not carry the effective `tier` (only
  // /me does), so after adopting tokens we refetch /me to enrich the profile.
  const adopt = useCallback(
    async (res: AuthResponse) => {
      persist(res.accessToken, res.refreshToken);
      setUser(res.user); // optimistic; tier filled in by the refresh below
      await refreshUser();
    },
    [persist, refreshUser],
  );

  const login = useCallback(async (email: string, password: string) => {
    await adopt(await loginRequest(email, password));
  }, [adopt]);

  const register = useCallback(async (email: string, password: string, fullName?: string) => {
    await adopt(await registerRequest(email, password, fullName));
  }, [adopt]);

  const logout = useCallback(async () => {
    const rt = refreshTokenRef.current;
    if (rt) await logoutRequest(rt).catch(() => {});
    clear();
  }, [clear]);

  const api = useMemo<AuthContextValue['api']>(
    () => ({
      getSubscription: () => authedFetch<Subscription>('/me/subscription'),
      getUsage: () => authedFetch<Usage>('/me/usage'),
      getAdvancedReport: () => authedFetch<{ report: string; generatedAt: string }>('/reports/advanced'),
      updateName: (fullName: string) =>
        authedFetch<PublicUser>('/me', { method: 'PATCH', body: JSON.stringify({ fullName }) }),
      billingConfig: () => authedFetch<BillingConfig>('/billing/config'),
      checkout: () => authedFetch<CheckoutResult>('/billing/checkout', { method: 'POST' }),
      portal: () => authedFetch<{ url: string; mode: 'stripe' | 'dev' }>('/billing/portal', { method: 'POST' }),
      devComplete: () => authedFetch<{ ok: boolean; tier: string }>('/billing/dev/complete', { method: 'POST' }),
      devCancel: () => authedFetch<{ ok: boolean; tier: string }>('/billing/dev/cancel', { method: 'POST' }),
      adminUsers: (search?: string) =>
        authedFetch<{ users: AdminUser[] }>(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(
          (r) => r.users,
        ),
      adminMetrics: () => authedFetch<AdminMetrics>('/admin/metrics'),
      setUserRole: (id: string, role: 'user' | 'admin') =>
        authedFetch<void>(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    }),
    [authedFetch],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refreshUser, api }),
    [user, loading, login, register, logout, refreshUser, api],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
