import { initializeApp, getApps } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

export { getFirestore } from "firebase-admin/firestore";
export { getStorage } from "firebase-admin/storage";
export { getAuth } from "firebase-admin/auth";
