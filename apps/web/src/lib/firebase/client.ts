'use client';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase web config is public by design (security lives in Firestore rules). Env vars override these defaults.
const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAzvvGzJ_Kva1HfY2KW3lYF3nWCf6OB1No',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'inboxcero-1b7a9.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'inboxcero-1b7a9',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '431212897990',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:431212897990:web:dc5e1bcf0b992c4b7619c7',
};
export const app = getApps()[0] ?? initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const google = new GoogleAuthProvider();
