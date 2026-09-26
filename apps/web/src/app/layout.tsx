import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = { title: process.env.NEXT_PUBLIC_APP_NAME ?? 'Atlas', description: 'Your AI Chief of Staff — triage, projects, OKRs, finance and content, governed and audited.', metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined, openGraph: { title: 'Atlas', description: 'Your AI Chief of Staff', siteName: 'Atlas' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0d0e11' }, { media: '(prefers-color-scheme: light)', color: '#fafafa' }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('atlas-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}` }} /></head>
      <body className="min-h-dvh"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
