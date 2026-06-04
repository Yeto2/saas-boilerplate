'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Usage, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Field, Input, Spinner, StatCard } from './ui';
import { BoltIcon, ChartIcon, LockIcon, LogoutIcon, SparkIcon, UserIcon } from './icons';
import { BillingCard } from './BillingCard';
import { AdminPanel } from './AdminPanel';

function ProfileCard() {
  const { user, api, refreshUser } = useAuth();
  const [name, setName] = useState(user?.fullName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.updateName(name.trim());
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
          <UserIcon width={18} height={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Profile</h2>
          <p className="text-xs text-zinc-500">{user?.email}</p>
        </div>
      </div>
      <form onSubmit={save} className="space-y-3">
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={120} />
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={saving || !name.trim()}>
            {saving ? <Spinner /> : null}
            Save
          </Button>
          {saved ? <span className="text-xs text-emerald-400">Saved</span> : null}
        </div>
      </form>
    </Card>
  );
}

function UsageCard() {
  const { api } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);

  const load = useCallback(() => {
    api.getUsage().then(setUsage).catch(() => {});
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const total = usage?.metrics.reduce((sum, m) => sum + m.count, 0) ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
          <ChartIcon width={18} height={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Usage</h2>
          <p className="text-xs text-zinc-500">Period {usage?.period ?? '—'}</p>
        </div>
      </div>
      {!usage ? (
        <Spinner className="h-4 w-4" />
      ) : usage.metrics.length === 0 ? (
        <p className="text-sm text-zinc-500">No metered usage yet. Generate an advanced report to record some.</p>
      ) : (
        <ul className="space-y-2">
          {usage.metrics.map((m) => (
            <li key={m.metric} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{m.metric.replace(/_/g, ' ')}</span>
              <span className="font-medium text-zinc-200">{m.count}</span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t border-white/10 pt-2 text-sm">
            <span className="text-zinc-500">Total</span>
            <span className="font-semibold text-zinc-100">{total}</span>
          </li>
        </ul>
      )}
    </Card>
  );
}

function AdvancedReportCard({ tier, onUsed }: { tier: 'free' | 'pro'; onUsed: () => void }) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [gated, setGated] = useState(false);

  const run = async () => {
    setBusy(true);
    setResult(null);
    setGated(false);
    try {
      const r = await api.getAdvancedReport();
      setResult(`Generated at ${new Date(r.generatedAt).toLocaleTimeString()}`);
      onUsed();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) setGated(true);
      else setResult('Request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
          <SparkIcon width={18} height={18} />
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-zinc-100">Advanced report</h2>
          <p className="text-xs text-zinc-500">Pro-gated endpoint · returns 402 on Free</p>
        </div>
        <Badge tone={tier === 'pro' ? 'pro' : 'neutral'}>{tier === 'pro' ? 'unlocked' : 'pro only'}</Badge>
      </div>

      <Button onClick={run} disabled={busy} variant={tier === 'pro' ? 'primary' : 'subtle'}>
        {busy ? <Spinner /> : tier === 'pro' ? <SparkIcon width={16} height={16} /> : <LockIcon width={16} height={16} />}
        Generate report
      </Button>

      {result ? <p className="mt-3 text-sm text-emerald-400">{result}</p> : null}
      {gated ? (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
          <p className="text-sm font-medium text-amber-200">402 Payment Required</p>
          <p className="mt-0.5 text-xs text-amber-300/80">
            This endpoint needs the Pro tier. Upgrade in the Subscription card to unlock it.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const [version, setVersion] = useState(0); // bump to refetch tier-dependent cards
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  if (!user) return null;
  const tier = user.tier;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <BoltIcon width={22} height={22} />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">SaaS Console</h1>
            <p className="text-xs text-zinc-500">
              {user.fullName ? `${user.fullName} · ` : ''}
              {user.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={tier === 'pro' ? 'pro' : 'neutral'}>{tier === 'pro' ? 'PRO' : 'FREE'}</Badge>
          {user.role === 'admin' ? <Badge tone="info">admin</Badge> : null}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogoutIcon width={15} height={15} />
            Log out
          </Button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="grid gap-5 sm:grid-cols-2">
            <ProfileCard />
            <UsageCard key={`usage-${version}`} />
          </div>
          <AdvancedReportCard key={`report-${version}`} tier={tier} onUsed={bump} />
          {user.role === 'admin' ? <AdminPanel /> : null}
        </div>
        <div className="space-y-5">
          <BillingCard key={`billing-${version}`} tier={tier} onChanged={bump} />
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-zinc-200">Session</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">User ID</span>
                <code className="font-mono text-xs text-zinc-400">{user.id.slice(0, 8)}…</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Email verified</span>
                <Badge tone={user.emailVerified ? 'success' : 'neutral'}>{user.emailVerified ? 'yes' : 'no'}</Badge>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-zinc-600">
              Access tokens auto-refresh via rotating refresh tokens. Reusing a revoked token revokes the whole family.
            </p>
          </Card>
        </div>
      </div>

      <footer className="mt-10 text-center text-xs text-zinc-600">
        JWT auth · refresh-token rotation · Stripe-backed tier gating · usage metering
      </footer>
    </div>
  );
}
