export const cn = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');
export const fmtMoney = (n: number, c = 'NZD') => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
export const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '');
export const relTime = (s?: string) => { if (!s) return ''; const d = (Date.now() - new Date(s).getTime()) / 1000; if (d < 60) return 'now'; if (d < 3600) return `${Math.floor(d / 60)}m`; if (d < 86400) return `${Math.floor(d / 3600)}h`; return `${Math.floor(d / 86400)}d`; };
export const quarterOf = (d = new Date(), start: 'calendar' | 'april' = 'calendar') => { const m = d.getMonth(); const shift = start === 'april' ? (m + 9) % 12 : m; const y = start === 'april' && m < 3 ? d.getFullYear() - 1 : d.getFullYear(); return `${y}-Q${Math.floor(shift / 3) + 1}`; };
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
