"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 동의된 경우에만 Sentry로 (analytics에서 처리)
    if (typeof window !== "undefined") {
      console.error("[VibeMoji error]", error);
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mb-4 text-6xl">😵‍💫</div>
      <h1 className="text-2xl font-bold">잠시 문제가 생겼어요</h1>
      <p className="mt-2 text-base-content/70">
        에러가 자동으로 기록됐어요. 새로고침하면 보통 풀려요.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-base-content/50">디버그 ID: {error.digest}</p>
      )}
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={reset} className="btn btn-primary">
          다시 시도
        </button>
        <a href="/" className="btn btn-ghost">
          홈으로
        </a>
      </div>
    </div>
  );
}
