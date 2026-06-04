'use client';

import { AuthProvider, useAuth } from '@/lib/auth';
import { AuthScreen } from '@/components/AuthScreen';
import { Dashboard } from '@/components/Dashboard';
import { Spinner } from '@/components/ui';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        <Spinner /> Loading…
      </div>
    );
  }
  return user ? <Dashboard /> : <AuthScreen />;
}

export default function Home() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
