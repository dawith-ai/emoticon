"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const { configured, loading, user, profile, signIn, signUp, logOut } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const title = useMemo(
    () => (mode === "signin" ? "로그인" : "무료 회원가입"),
    [mode]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password, displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 처리 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="alert alert-warning">
          <span>
            Firebase 클라이언트 환경변수가 아직 없습니다. `.env.local`에
            `NEXT_PUBLIC_FIREBASE_*` 값을 넣으면 로그인/Firestore가 활성화됩니다.
          </span>
        </div>
        <div className="mockup-code text-xs">
          <pre data-prefix="$">
            <code>firebase apps:create WEB VibeMoji --project vibemoji-app</code>
          </pre>
          <pre data-prefix="$">
            <code>firebase apps:sdkconfig WEB --project vibemoji-app</code>
          </pre>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h1 className="card-title">로그인 완료</h1>
            <p className="text-sm text-base-content/70">
              {profile?.displayName || user.email} 계정으로 작업 중입니다.
            </p>
            <div className="stats mt-3 bg-base-200">
              <div className="stat">
                <div className="stat-title">보유 크레딧</div>
                <div className="stat-value text-primary">💎 {profile?.credits ?? 0}</div>
              </div>
            </div>
            <div className="card-actions mt-4 justify-end">
              <button onClick={logOut} className="btn btn-ghost">
                로그아웃
              </button>
              <Link href="/generate" className="btn btn-primary">
                AI 생성으로 이동
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="card border border-base-300 bg-base-100">
        <form onSubmit={onSubmit} className="card-body">
          <h1 className="card-title">{title}</h1>
          <p className="text-sm text-base-content/70">
            가입하면 Firestore 사용자 문서와 무료 50 크레딧이 준비됩니다.
          </p>
          {mode === "signup" && (
            <label className="form-control">
              <span className="label-text">닉네임</span>
              <input
                className="input input-bordered"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="스튜디오 이름"
              />
            </label>
          )}
          <label className="form-control">
            <span className="label-text">이메일</span>
            <input
              className="input input-bordered"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="form-control">
            <span className="label-text">비밀번호</span>
            <input
              className="input input-bordered"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6자 이상"
            />
          </label>
          {error && <div className="alert alert-error text-sm">{error}</div>}
          <button disabled={busy} className="btn btn-primary mt-2">
            {busy && <span className="loading loading-spinner loading-xs" />}
            {title}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "처음이면 무료 회원가입" : "이미 계정이 있으면 로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
