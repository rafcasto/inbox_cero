import Link from 'next/link';
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b"><div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><img src="/brand/atlas-mark.svg" alt="" width={24} height={24} className="rounded-md" />Atlas</Link><nav className="ml-auto flex gap-4 text-sm muted"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/login">Sign in</Link></nav></div></header>
      <main className="mx-auto max-w-3xl px-4 py-10 prose-atlas">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 py-8 text-xs muted">© {new Date().getFullYear()} Digital Pathways · Aotearoa New Zealand · <a href="mailto:rafael@digitalpathways.io" className="underline">rafael@digitalpathways.io</a></footer>
    </div>
  );
}
