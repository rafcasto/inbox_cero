'use client';
import { auth } from './firebase/client';

/** Call a route handler with the user's ID token. */
export async function api<T = any>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), ...init });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j as T;
}

export const enqueue = (type: string, payload: Record<string, unknown> = {}) => api('/api/jobs', { type, payload });
