'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input, Spinner } from './ui';
import { BoltIcon, ShieldIcon } from './icons';

type Mode = 'login' | 'register';

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await register(email.trim(), password, fullName.trim() || undefined);
      else await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 0 || err.message.includes('fetch')
            ? `Could not reach the API — is the backend running on ${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4020'}?`
            : err.message,
        );
      } else {
        setError('Could not reach the API. Start the backend and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => {
    const rnd = Math.random().toString(36).slice(2, 8);
    setMode('register');
    setEmail(`demo+${rnd}@acme.test`);
    setPassword('demo-password-123');
    setFullName('Demo User');
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
          <BoltIcon width={24} height={24} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">SaaS Console</h1>
          <p className="text-xs text-zinc-500">Auth, subscriptions & tier gating</p>
        </div>
      </div>

      <Card className="p-7">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          {(['register', 'login'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                mode === m ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {m === 'register' ? 'Sign up' : 'Log in'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' ? (
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace" />
            </Field>
          ) : null}
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </Field>

          {error ? (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          ) : null}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Spinner /> : <ShieldIcon width={16} height={16} />}
            {mode === 'register' ? 'Create account' : 'Log in'}
          </Button>
        </form>

        <button
          onClick={useDemo}
          className="mt-4 w-full text-center text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          Fill demo credentials
        </button>
      </Card>

      <p className="mt-5 text-center text-xs text-zinc-600">
        JWT access tokens with refresh-token rotation · passwords hashed with scrypt
      </p>
    </div>
  );
}
