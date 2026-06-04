'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
};

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-indigo-500 text-white hover:bg-indigo-400 active:bg-indigo-600 shadow-lg shadow-indigo-500/20 disabled:bg-indigo-500/40 disabled:shadow-none',
  ghost: 'bg-transparent text-zinc-300 hover:bg-white/5 hover:text-white border border-white/10 disabled:opacity-40',
  danger: 'bg-transparent text-red-300 hover:bg-red-500/10 hover:text-red-200 border border-red-500/20 disabled:opacity-40',
  subtle: 'bg-white/5 text-zinc-200 hover:bg-white/10 border border-white/10 disabled:opacity-40',
};

export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400',
        'disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        buttonVariants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm shadow-xl shadow-black/20',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'pro';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/5 text-zinc-300 border-white/10',
    success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-300 border-red-500/20',
    info: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    pro: 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-200 border-indigo-400/30',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 ' +
  'transition-colors focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputBase, className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}

export function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
        {icon ? <span className="text-zinc-500">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
    </Card>
  );
}
