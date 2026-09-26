'use client';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

/** Shown while auth/data resolve. Surfaces the real error instead of spinning forever. */
export function LoadingState({ error, stage }: { error?: string | null; stage?: string }) {
  if (error) return (
    <div className="min-h-dvh flex items-center justify-center p-4"><div className="card p-5 max-w-md text-sm space-y-3">
      <div className="font-medium">Can't load your data</div>
      <div className="muted">{error}</div>
      <div className="text-xs muted">Project: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}. Firebase console → Firestore Database must exist, and rules must be deployed (<code>pnpm deploy:rules</code>).</div>
      <div className="flex gap-2"><button className="btn btn-ghost" onClick={() => location.reload()}>Retry</button><button className="btn btn-ghost" onClick={() => signOut(auth).then(() => (location.href = '/login'))}>Sign out</button></div>
    </div></div>
  );
  return <div className="p-8 muted text-sm">Loading{stage ? ` ${stage}` : ''}…</div>;
}
