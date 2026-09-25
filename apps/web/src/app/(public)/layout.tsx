export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh flex items-center justify-center p-4"><div className="w-full max-w-sm"><div className="mb-6 text-center font-semibold tracking-tight text-lg">{process.env.NEXT_PUBLIC_APP_NAME ?? 'Atlas'}</div>{children}</div></div>;
}
