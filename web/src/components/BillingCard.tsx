'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Subscription } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Spinner } from './ui';
import { CardIcon, CheckIcon, CrownIcon } from './icons';

const PRO_FEATURES = ['Advanced analytics reports', 'Priority processing', 'Unlimited seats', 'SSO & audit log'];

function statusTone(status: Subscription['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due') return 'warning';
  if (status === 'canceled') return 'danger';
  return 'neutral';
}

export function BillingCard({ tier, onChanged }: { tier: 'free' | 'pro'; onChanged: () => void }) {
  const { api, refreshUser } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, cfg] = await Promise.all([api.getSubscription(), api.billingConfig()]);
    setSub(s);
    setStripeConfigured(cfg.stripeConfigured);
  }, [api]);

  useEffect(() => {
    load().catch(() => {});
  }, [load, tier]);

  const upgrade = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const checkout = await api.checkout();
      if (checkout.mode === 'stripe') {
        window.location.href = checkout.url; // real Stripe Checkout
        return;
      }
      // Dev mode: no Stripe to call the webhook back, so complete locally.
      await api.devComplete();
      await Promise.all([load(), refreshUser()]);
      onChanged();
      setNote('Upgraded to Pro (dev mode — simulated checkout.session.completed).');
    } catch {
      setNote('Upgrade failed. Is the backend running?');
    } finally {
      setBusy(false);
    }
  }, [api, load, refreshUser, onChanged]);

  const cancel = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      if (stripeConfigured) {
        const portal = await api.portal();
        window.location.href = portal.url;
        return;
      }
      await api.devCancel();
      await Promise.all([load(), refreshUser()]);
      onChanged();
      setNote('Downgraded to Free (dev mode — simulated customer.subscription.deleted).');
    } catch {
      setNote('Action failed.');
    } finally {
      setBusy(false);
    }
  }, [api, stripeConfigured, load, refreshUser, onChanged]);

  const isPro = tier === 'pro';

  return (
    <Card className={`relative overflow-hidden p-5 ${isPro ? 'shimmer-border p-[1px]' : ''}`}>
      <div className={isPro ? 'rounded-[15px] bg-[#0b0b12] p-5' : ''}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
              {isPro ? <CrownIcon width={18} height={18} /> : <CardIcon width={18} height={18} />}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Subscription</h2>
              <p className="text-xs text-zinc-500">{isPro ? 'Pro plan' : 'Free plan'}</p>
            </div>
          </div>
          <Badge tone={isPro ? 'pro' : 'neutral'}>{isPro ? 'PRO' : 'FREE'}</Badge>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Status</span>
            {sub ? <Badge tone={statusTone(sub.status)}>{sub.status}</Badge> : <Spinner className="h-4 w-4" />}
          </div>
          {sub?.currentPeriodEnd ? (
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Renews</span>
              <span className="text-zinc-300">{new Date(sub.currentPeriodEnd * 1000).toLocaleDateString()}</span>
            </div>
          ) : null}
          {sub?.cancelAtPeriodEnd ? (
            <p className="text-xs text-amber-300">Cancels at period end.</p>
          ) : null}
        </div>

        {!isPro ? (
          <ul className="mt-4 space-y-1.5">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                <CheckIcon width={14} height={14} className="text-indigo-400" />
                {f}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex gap-2">
          {isPro ? (
            <Button variant="danger" onClick={cancel} disabled={busy} className="w-full">
              {busy ? <Spinner /> : null}
              {stripeConfigured ? 'Manage billing' : 'Cancel subscription'}
            </Button>
          ) : (
            <Button onClick={upgrade} disabled={busy} className="w-full">
              {busy ? <Spinner /> : <CrownIcon width={16} height={16} />}
              Upgrade to Pro
            </Button>
          )}
        </div>

        {note ? <p className="mt-3 text-xs text-zinc-500">{note}</p> : null}
        {stripeConfigured === false ? (
          <p className="mt-2 text-[11px] text-zinc-600">
            Dev mode: Stripe is not configured, so checkout is simulated locally. Set STRIPE_SECRET_KEY to use real
            Checkout + webhooks.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
