"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from "firebase/firestore";
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/components/AuthProvider";
import {
  getClientAuth,
  getClientDb,
  getClientFunctions,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import { getClientStorage } from "@/lib/firebase/storage";
import { callFunction } from "@/lib/firebase/functions";

type Status = "idle" | "running" | "ok" | "fail";

type Check = {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  durationMs?: number;
};

const INITIAL_CHECKS: Check[] = [
  { id: "env", label: "환경변수 (NEXT_PUBLIC_FIREBASE_*)", status: "idle" },
  { id: "app", label: "Firebase App 초기화", status: "idle" },
  { id: "auth", label: "Auth SDK 로드", status: "idle" },
  { id: "firestore-read", label: "Firestore 읽기 (users/me)", status: "idle" },
  { id: "firestore-write", label: "Firestore 쓰기 (users/me/projects)", status: "idle" },
  { id: "storage", label: "Storage 업로드 → 다운로드 URL", status: "idle" },
  { id: "functions-ping", label: "Functions 핑 (없으면 'unauthenticated' OK)", status: "idle" },
];

export default function DebugPage() {
  const { user, loading } = useAuth();
  const [checks, setChecks] = useState<Check[]>(INITIAL_CHECKS);
  const [running, setRunning] = useState(false);

  const setCheck = (id: string, patch: Partial<Check>) =>
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const time = async <T,>(id: string, fn: () => Promise<T>) => {
    const start = performance.now();
    setCheck(id, { status: "running" });
    try {
      await fn();
      setCheck(id, {
        status: "ok",
        durationMs: Math.round(performance.now() - start),
      });
    } catch (err) {
      setCheck(id, {
        status: "fail",
        durationMs: Math.round(performance.now() - start),
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  };

  const runAll = async () => {
    setRunning(true);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: "idle" })));

    await time("env", async () => {
      if (!isFirebaseConfigured) throw new Error("Firebase env vars not set");
    });
    await time("app", async () => {
      if (!isFirebaseConfigured) throw new Error("미설정으로 스킵");
    });
    await time("auth", async () => {
      const auth = getClientAuth();
      if (!auth) throw new Error("Auth instance null");
    });
    await time("firestore-read", async () => {
      const db = getClientDb();
      if (!db) throw new Error("DB null");
      if (user) {
        await getDoc(doc(db, "users", user.uid));
      } else {
        // public/waitlist 컬렉션 list (rules에서 readable이 아닐 수 있음 — fail 정상)
        await getDocs(query(collection(db, "platforms"), limit(1)));
      }
    });
    await time("firestore-write", async () => {
      const db = getClientDb();
      if (!db) throw new Error("DB null");
      if (!user) throw new Error("로그인 필요 (write rule 검증 못 함)");
      // 임시 프로젝트 한 개 생성 시도
      const { addDoc, collection: col, serverTimestamp } = await import("firebase/firestore");
      const ref = await addDoc(col(db, "users", user.uid, "projects"), {
        title: "[debug] health check",
        source: "debug",
        status: "test",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const { deleteDoc, doc: d } = await import("firebase/firestore");
      await deleteDoc(d(db, "users", user.uid, "projects", ref.id)); // 정리
    });
    await time("storage", async () => {
      const s = getClientStorage();
      if (!s) throw new Error("Storage null");
      if (!user) throw new Error("로그인 필요");
      const path = `users/${user.uid}/profile/debug-${Date.now()}.txt`;
      const r = storageRef(s, path);
      await uploadString(r, "ping", "raw", { contentType: "text/plain" });
      await getDownloadURL(r);
    });
    await time("functions-ping", async () => {
      const fns = getClientFunctions();
      if (!fns) throw new Error("Functions null");
      // 의도적으로 잘못된 입력 → unauthenticated/invalid-argument 떨어지면 SDK 통신은 정상
      const result = await callFunction("generateSeedCharacter", {});
      if (result.ok) return;
      // unauthenticated/invalid-argument는 통신 자체는 OK
      if (
        result.code === "functions/unauthenticated" ||
        result.code === "functions/invalid-argument" ||
        result.code === "unauthenticated" ||
        result.code === "invalid-argument"
      ) {
        return;
      }
      // not-found = 함수 미배포 신호
      if (result.code === "functions/not-found" || result.code === "not-found") {
        throw new Error(`함수 미배포: ${result.error}`);
      }
      throw new Error(`${result.code ?? "?"}: ${result.error}`);
    });

    setRunning(false);
  };

  useEffect(() => {
    if (!loading && isFirebaseConfigured) {
      void runAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const passCount = checks.filter((c) => c.status === "ok").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🩺 Firebase 헬스체크</h1>
        <button
          onClick={runAll}
          disabled={running || !isFirebaseConfigured}
          className="btn btn-primary btn-sm"
        >
          {running ? "검사 중..." : "다시 검사"}
        </button>
      </div>

      <div className="alert text-xs">
        <span>
          {isFirebaseConfigured
            ? "Firebase 환경변수 감지됨. 로그인하면 모든 검사를 통과해야 정상."
            : "Firebase 환경변수 미설정. NEXT_PUBLIC_FIREBASE_* 등록 필요."}
          {!loading && !user && " · 로그인 안 됨 → 일부 검사는 의도적 실패."}
        </span>
      </div>

      <div className="stats stats-horizontal w-full shadow">
        <div className="stat">
          <div className="stat-title text-xs">통과</div>
          <div className="stat-value text-success text-2xl">{passCount}</div>
        </div>
        <div className="stat">
          <div className="stat-title text-xs">실패</div>
          <div className="stat-value text-error text-2xl">{failCount}</div>
        </div>
        <div className="stat">
          <div className="stat-title text-xs">전체</div>
          <div className="stat-value text-2xl">{checks.length}</div>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body p-3">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>상태</th>
                <th>검사</th>
                <th>지연</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td className="w-12">{statusIcon(c.status)}</td>
                  <td className="font-medium">{c.label}</td>
                  <td className="w-20 text-xs text-base-content/60">
                    {c.durationMs ? `${c.durationMs}ms` : "—"}
                  </td>
                  <td className="text-xs text-base-content/70">
                    {c.detail ?? (c.status === "ok" ? "정상" : "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-100 text-xs">
        <div className="card-body p-4">
          <h3 className="font-bold">관리자 노트 — 발행 전 점검 순서</h3>
          <ol className="list-decimal pl-5">
            <li>위 검사가 모두 통과 (로그인 후) → 클라이언트 SDK 동작 OK</li>
            <li>functions-ping에서 not-found 떨어지면 → Functions 미배포</li>
            <li>storage에서 fail 떨어지면 → Storage 미초기화 또는 룰 거부</li>
            <li>모두 통과해야 generate/editor 실호출 시도 권장</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function statusIcon(s: Status) {
  if (s === "ok") return <span className="badge badge-success badge-sm">✓</span>;
  if (s === "fail") return <span className="badge badge-error badge-sm">✕</span>;
  if (s === "running") return <span className="loading loading-spinner loading-xs" />;
  return <span className="badge badge-ghost badge-sm">…</span>;
}
