"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import {
  getClientAuth,
  getClientDb,
  isFirebaseConfigured,
} from "@/lib/firebase/client";

type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  credits: number;
};

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  credits: number;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeProfile(uid: string, data: DocumentData | undefined, user: User): UserProfile {
  return {
    uid,
    email: typeof data?.email === "string" ? data.email : user.email,
    displayName:
      typeof data?.displayName === "string" ? data.displayName : user.displayName,
    photoURL: typeof data?.photoURL === "string" ? data.photoURL : user.photoURL,
    credits: typeof data?.credits === "number" ? data.credits : 5,
  };
}

async function ensureUserDocument(user: User) {
  const db = getClientDb();
  if (!db) return;
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      photoURL: user.photoURL ?? "",
      credits: 5,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(
    userRef,
    {
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      photoURL: user.photoURL ?? "",
      lastActiveAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const auth = getClientAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    let unsubscribeProfile: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      unsubscribeProfile?.();
      setUser(nextUser);
      setProfile(null);
      if (!nextUser) {
        setLoading(false);
        return;
      }

      await ensureUserDocument(nextUser).catch(() => undefined);
      const db = getClientDb();
      if (!db) {
        setLoading(false);
        return;
      }
      unsubscribeProfile = onSnapshot(doc(db, "users", nextUser.uid), (snap) => {
        setProfile(normalizeProfile(nextUser.uid, snap.data(), nextUser));
        setLoading(false);
      });
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const auth = getClientAuth();
      if (!auth) throw new Error("Firebase 클라이언트 설정이 필요합니다.");
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName.trim()) {
        await updateProfile(credential.user, { displayName: displayName.trim() });
      }
      await ensureUserDocument(credential.user);
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getClientAuth();
    if (!auth) throw new Error("Firebase 클라이언트 설정이 필요합니다.");
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDocument(credential.user);
  }, []);

  const logOut = useCallback(async () => {
    const auth = getClientAuth();
    if (auth) await signOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isFirebaseConfigured,
      loading,
      user,
      profile,
      credits: profile?.credits ?? 0,
      signUp,
      signIn,
      logOut,
    }),
    [loading, user, profile, signUp, signIn, logOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
