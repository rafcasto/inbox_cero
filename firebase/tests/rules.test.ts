import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const A = 'user-a';
const B = 'user-b';

const userDoc = (email: string) => ({ email, createdAt: new Date().toISOString(), timezone: 'Pacific/Auckland', onboardingComplete: false });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-atlas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${A}`), userDoc('a@x.io'));
    await setDoc(doc(db, `users/${B}`), userDoc('b@x.io'));
    await setDoc(doc(db, `users/${A}/items/i1`), { summary: 'A item', status: 'new' });
    await setDoc(doc(db, `users/${B}/items/i1`), { summary: 'B item', status: 'new' });
    await setDoc(doc(db, `users/${A}/audit/a1`), { action: 'x' });
    await setDoc(doc(db, `users/${A}/profile/main`), { identity: { name: 'A' } });
    await setDoc(doc(db, `invites/CODE1`), { createdBy: 'admin' });
  });
});

const asA = () => env.authenticatedContext(A, { email: 'a@x.io', email_verified: true }).firestore();
const asAUnverified = () => env.authenticatedContext(A, { email: 'a@x.io', email_verified: false }).firestore();
const asB = () => env.authenticatedContext(B, { email: 'b@x.io', email_verified: true }).firestore();
const asAdmin = () => env.authenticatedContext('admin', { email: 'admin@x.io', email_verified: true, admin: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('tenant isolation', () => {
  it('owner can read own user doc and items', async () => {
    await assertSucceeds(getDoc(doc(asA(), `users/${A}`)));
    await assertSucceeds(getDoc(doc(asA(), `users/${A}/items/i1`)));
    await assertSucceeds(getDocs(collection(asA(), `users/${A}/items`)));
  });
  it('user B cannot read, list or write anything under user A', async () => {
    await assertFails(getDoc(doc(asB(), `users/${A}`)));
    await assertFails(getDoc(doc(asB(), `users/${A}/items/i1`)));
    await assertFails(getDocs(collection(asB(), `users/${A}/items`)));
    await assertFails(setDoc(doc(asB(), `users/${A}/items/i9`), { summary: 'hack' }));
    await assertFails(updateDoc(doc(asB(), `users/${A}/items/i1`), { summary: 'hack' }));
    await assertFails(deleteDoc(doc(asB(), `users/${A}/items/i1`)));
    await assertFails(getDoc(doc(asB(), `users/${A}/profile/main`)));
  });
  it('anonymous gets nothing', async () => {
    await assertFails(getDoc(doc(anon(), `users/${A}`)));
    await assertFails(getDoc(doc(anon(), `users/${A}/items/i1`)));
    await assertFails(getDocs(collection(anon(), 'users')));
  });
  it('users cannot list all users', async () => {
    await assertFails(getDocs(collection(asA(), 'users')));
  });
});

describe('verification gate', () => {
  it('unverified owner can read their user doc but not subcollections', async () => {
    await assertSucceeds(getDoc(doc(asAUnverified(), `users/${A}`)));
    await assertFails(getDoc(doc(asAUnverified(), `users/${A}/items/i1`)));
    await assertFails(setDoc(doc(asAUnverified(), `users/${A}/tasks/t1`), { title: 'x' }));
  });
});

describe('server-only collections', () => {
  it('owner can read audit/usageLogs but never write', async () => {
    await assertSucceeds(getDoc(doc(asA(), `users/${A}/audit/a1`)));
    await assertFails(setDoc(doc(asA(), `users/${A}/audit/a2`), { action: 'forged' }));
    await assertFails(setDoc(doc(asA(), `users/${A}/usageLogs/u1`), { costUsd: 0 }));
    await assertFails(setDoc(doc(asA(), `users/${A}/financeSnapshots/2026-09`), { spend: 0 }));
  });
});

describe('user doc integrity', () => {
  it('create requires matching email and required keys', async () => {
    const C = 'user-c';
    const db = env.authenticatedContext(C, { email: 'c@x.io', email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, `users/${C}`), userDoc('someone-else@x.io')));
    await assertFails(setDoc(doc(db, `users/${C}`), { email: 'c@x.io' }));
    await assertSucceeds(setDoc(doc(db, `users/${C}`), userDoc('c@x.io')));
  });
  it('owner cannot change email, createdAt or status', async () => {
    await assertFails(updateDoc(doc(asA(), `users/${A}`), { email: 'new@x.io' }));
    await assertFails(updateDoc(doc(asA(), `users/${A}`), { status: 'admin' }));
    await assertSucceeds(updateDoc(doc(asA(), `users/${A}`), { displayName: 'Rafael', onboardingComplete: true }));
  });
});

describe('invites and admin', () => {
  it('only admin can read/write invites', async () => {
    await assertFails(getDoc(doc(asA(), 'invites/CODE1')));
    await assertFails(setDoc(doc(asA(), 'invites/CODE2'), { createdBy: A }));
    await assertSucceeds(getDoc(doc(asAdmin(), 'invites/CODE1')));
    await assertSucceeds(setDoc(doc(asAdmin(), 'invites/CODE2'), { createdBy: 'admin' }));
  });
  it('admin can read any user doc and list users, but not write their data', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), `users/${A}`)));
    await assertSucceeds(getDocs(collection(asAdmin(), 'users')));
    await assertSucceeds(getDoc(doc(asAdmin(), `users/${A}/audit/a1`)));
    await assertFails(setDoc(doc(asAdmin(), `users/${A}/items/i9`), { summary: 'admin write' }));
  });
});
