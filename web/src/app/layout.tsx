import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SaaS Console — Auth & Billing',
  description:
    'Production-grade SaaS starter: JWT auth with refresh-token rotation, Stripe-backed subscriptions with tier gating, usage metering, and an admin panel.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased selection:bg-indigo-500/30">{children}</body>
    </html>
  );
}
