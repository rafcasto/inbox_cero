export const log = {
  info: (msg: string, meta: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), lvl: 'info', msg, ...meta })),
  warn: (msg: string, meta: Record<string, unknown> = {}) => console.warn(JSON.stringify({ t: new Date().toISOString(), lvl: 'warn', msg, ...meta })),
  error: (msg: string, meta: Record<string, unknown> = {}) => console.error(JSON.stringify({ t: new Date().toISOString(), lvl: 'error', msg, ...meta })),
};
