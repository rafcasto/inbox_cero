'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Sun, Inbox, Columns3, Target, PenLine, Wallet, BookOpen, Settings, Shield, Moon, SunMedium } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useKey } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const primary = [
  { href: '/today', label: 'Today', icon: Sun, key: '1' },
  { href: '/inbox', label: 'Inbox', icon: Inbox, key: '2' },
  { href: '/board', label: 'Board', icon: Columns3, key: '3' },
];
const secondary = [
  { href: '/okrs', label: 'OKRs', icon: Target, key: '4' },
  { href: '/content', label: 'Content', icon: PenLine, key: '5' },
  { href: '/finance', label: 'Finance', icon: Wallet, key: '6' },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen, key: '7' },
  { href: '/settings', label: 'Settings', icon: Settings, key: ',' },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const r = useRouter();
  const { isAdmin } = useAuth();
  const [theme, setTheme] = useState<string>('');
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? ''); }, []);
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('atlas-theme', next); setTheme(next); };
  useKey((e) => { if (e.metaKey || e.ctrlKey || e.altKey) return; const all = [...primary, ...secondary]; const hit = all.find((n) => n.key === e.key); if (hit) { e.preventDefault(); r.push(hit.href); } }, [r]);
  const items = [...primary, ...secondary, ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: Shield, key: '' }] : [])];
  const NavLink = ({ n, compact }: { n: (typeof items)[number]; compact?: boolean }) => (
    <Link href={n.href} className={cn('flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm', compact && 'flex-col gap-0.5 px-1 py-1 text-[10px]', path.startsWith(n.href) ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium' : 'muted hover:text-[var(--color-fg)]')}>
      <n.icon size={compact ? 20 : 16} strokeWidth={1.75} /><span>{n.label}</span>{!compact && n.key && <span className="kbd ml-auto hidden lg:inline">{n.key}</span>}
    </Link>
  );
  return (
    <div className="min-h-dvh sm:flex">
      <aside className="hidden sm:flex sm:flex-col w-56 shrink-0 border-r p-3 gap-0.5 sticky top-0 h-dvh">
        <div className="px-3 py-2 mb-2 font-semibold tracking-tight flex items-center justify-between">{process.env.NEXT_PUBLIC_APP_NAME ?? 'Atlas'}<button onClick={toggleTheme} className="muted" aria-label="theme">{theme === 'dark' ? <SunMedium size={15} /> : <Moon size={15} />}</button></div>
        {primary.map((n) => <NavLink key={n.href} n={n} />)}
        <div className="h-px my-2" style={{ background: 'var(--color-line)' }} />
        {items.slice(3).map((n) => <NavLink key={n.href} n={n} />)}
      </aside>
      <main className="flex-1 min-w-0 pb-20 sm:pb-8"><div className="mx-auto max-w-5xl p-4 sm:p-8">{children}</div></main>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 border-t grid grid-cols-6 px-1 pb-[env(safe-area-inset-bottom)]" style={{ background: 'var(--color-card)' }}>
        {[...primary, secondary[0], secondary[2], secondary[4]].map((n) => <NavLink key={n!.href} n={n!} compact />)}
      </nav>
    </div>
  );
}
