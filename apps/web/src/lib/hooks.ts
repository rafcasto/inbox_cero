'use client';
import { useEffect, useState, useMemo } from 'react';
import { onSnapshot, query, collection, type Query, type QueryConstraint, doc, type DocumentData } from 'firebase/firestore';
import { db } from './firebase/client';
import { ucol } from './db';

export type WithId<T> = T & { id: string };

/** Realtime collection under users/{uid}/{name}. Constraints are memoised by their string form. */
export function useCol<T = DocumentData>(uid: string | undefined, name: string, constraints: QueryConstraint[] = [], deps: unknown[] = []) {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const key = useMemo(() => JSON.stringify(deps), [deps]);
  useEffect(() => {
    if (!uid) return;
    const q: Query = query(ucol(uid, name), ...constraints);
    const unsub = onSnapshot(q, (s) => { setData(s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))); setLoading(false); }, (e) => { console.error(name, e); setLoading(false); });
    return unsub;
  }, [uid, name, key]);
  return { data, loading };
}

export function useDoc<T = DocumentData>(uid: string | undefined, name: string, id: string) {
  const [data, setData] = useState<WithId<T> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid, name, id), (s) => { setData(s.exists() ? ({ id: s.id, ...(s.data() as T) }) : null); setLoading(false); });
  }, [uid, name, id]);
  return { data, loading };
}

export function useKey(handler: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName) || t?.isContentEditable) return; handler(e); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, deps);
}

/** Realtime nested collection: users/{uid}/<segments...> (e.g. ['chats', id, 'messages']). */
export function useSubCol<T = DocumentData>(uid: string | undefined, segments: string[], constraints: QueryConstraint[] = []) {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const key = segments.join('/');
  useEffect(() => {
    if (!uid || segments.some((s) => !s)) return;
    const c = collection(db, 'users', uid, ...(segments as [string, ...string[]]));
    const unsub = onSnapshot(query(c, ...constraints), (s) => { setData(s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))); setLoading(false); }, (e) => { console.error(key, e); setLoading(false); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);
  return { data, loading };
}
