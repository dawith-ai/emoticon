import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

export function getFirebaseApp() {
  if (!isFirebaseConfigured) return null;
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getClientAuth() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) {
    auth = getAuth(firebaseApp);
    void setPersistence(auth, browserSessionPersistence);
  }
  return auth;
}

export function getClientDb() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!db) db = getFirestore(firebaseApp);
  return db;
}

export const getFirebaseDb = getClientDb;

export function getClientFunctions() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!functions) functions = getFunctions(firebaseApp, "asia-northeast3");
  return functions;
}

export const getFirebaseFunctions = getClientFunctions;
