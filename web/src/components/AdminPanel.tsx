'use client';

import { useCallback, useEffect, useState } from 'react';
import { type AdminMetrics, type AdminUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Input, Spinner, StatCard } from './ui';
import { ChartIcon, ShieldIcon, UserIcon } from './icons';

export function AdminPanel() {
  const { api, user } = useAuth();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [m, u] = await Promise.all([api.adminMetrics(), api.adminUsers(search.trim() || undefined)]);
    setMetrics(m);
    setUsers(u);
    setLoading(false);
  }, [api, search]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const toggleRole = useCallback(
    async (u: AdminUser) => {
      const next = u.role === 'admin' ? 'user' : 'admin';
      setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, role: next } : p)));
      await api.setUserRole(u.id, next).catch(() => load());
    },
    [api, load],
  );

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-300">
          <ShieldIcon width={18} height={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Admin</h2>
          <p className="text-xs text-zinc-500">Workspace users & metrics</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Users" value={metrics?.totalUsers ?? '—'} icon={<UserIcon width={16} height={16} />} />
        <StatCard label="Pro subs" value={metrics?.activeProSubscriptions ?? '—'} icon={<ChartIcon width={16} height={16} />} />
        <StatCard label="Past due" value={metrics?.pastDue ?? '—'} />
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by email…"
        className="mb-3"
      />

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  <Spinner className="mx-auto" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-white/5">
                  <td className="px-3 py-2 text-zinc-300">
                    {u.email}
                    {u.id === user?.id ? <span className="ml-1.5 text-xs text-zinc-600">(you)</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={u.tier === 'pro' ? 'pro' : 'neutral'}>{u.tier ?? 'free'}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={u.role === 'admin' ? 'info' : 'neutral'}>{u.role}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => toggleRole(u)}
                      disabled={u.id === user?.id}
                    >
                      {u.role === 'admin' ? 'Demote' : 'Make admin'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
