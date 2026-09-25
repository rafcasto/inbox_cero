'use client';
import { collection, doc, setDoc, addDoc, deleteDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { db } from './firebase/client';

export const nowIso = () => new Date().toISOString();
export const ucol = (uid: string, name: string) => collection(db, 'users', uid, name);
export const udoc = (uid: string, name: string, id: string) => doc(db, 'users', uid, name, id);
export const upsert = (uid: string, name: string, id: string, data: DocumentData) => setDoc(udoc(uid, name, id), { ...data, updatedAt: nowIso() }, { merge: true });
export const create = (uid: string, name: string, data: DocumentData) => addDoc(ucol(uid, name), { ...data, createdAt: nowIso(), updatedAt: nowIso() });
export const patch = (uid: string, name: string, id: string, data: DocumentData) => updateDoc(udoc(uid, name, id), { ...data, updatedAt: nowIso() });
export const remove = (uid: string, name: string, id: string) => deleteDoc(udoc(uid, name, id));
