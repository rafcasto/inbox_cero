'use client';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

export const Button = ({ className, variant = 'ghost', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) => (
  <button className={cn('btn', variant === 'primary' && 'btn-primary', variant === 'ghost' && 'btn-ghost', variant === 'danger' && 'btn-ghost text-red-600', className)} {...p} />
);
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn('input', className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn('input min-h-24', className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn('input', className)} {...p} />;
export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (<label className="block"><span className="label">{label}</span>{children}{hint && <span className="block text-[11px] muted mt-1">{hint}</span>}</label>);
export const Card = ({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) => <div onClick={onClick} className={cn('card p-4', onClick && 'cursor-pointer hover:border-[var(--color-accent)]', className)}>{children}</div>;
export const H1 = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="flex items-baseline justify-between mb-4"><h1 className="text-xl font-semibold tracking-tight">{children}</h1>{right}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="card p-8 text-center text-sm muted">{children}</div>;
export const Pill = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('pill', className)}>{children}</span>;
export const PriorityPill = ({ p }: { p?: string }) => (p ? <span className={cn('pill', p.toLowerCase())}>{p}</span> : null);
export const Progress = ({ value, className }: { value: number; className?: string }) => (<div className={cn('h-1.5 w-full rounded-full overflow-hidden', className)} style={{ background: 'var(--color-line)' }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: 'var(--color-accent)' }} /></div>);
export const Modal = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => open ? (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
    <div className="card w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto p-5 rounded-b-none sm:rounded-b-[10px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">{title}</h2><button className="muted text-sm" onClick={onClose}>Esc</button></div>
      {children}
    </div>
  </div>
) : null;
