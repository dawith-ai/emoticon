"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vibemoji.cookie.consent.v1";

export type ConsentValue = {
  necessary: true; // 항상 true
  analytics: boolean;
  ts: number;
};

export function readConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConsentValue) : null;
  } catch {
    return null;
  }
}

function writeConsent(v: ConsentValue) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(readConsent() === null);
  }, []);

  if (!show) return null;

  const accept = (analytics: boolean) => {
    writeConsent({ necessary: true, analytics, ts: Date.now() });
    setShow(false);
    // 분석 동의 즉시 반영을 위해 페이지 새로고침 신호 (옵션)
    window.dispatchEvent(new CustomEvent("vibemoji:consent-changed"));
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center">
        <div className="flex-1 text-sm">
          🍪 VibeMoji는 서비스 제공에 필요한 쿠키와, 동의 시 분석용 쿠키(PostHog)를 사용해요.{" "}
          <a href="/privacy" className="link">자세히</a>
        </div>
        <div className="flex gap-2">
          <button onClick={() => accept(false)} className="btn btn-ghost btn-sm">
            필수만 허용
          </button>
          <button onClick={() => accept(true)} className="btn btn-primary btn-sm">
            모두 허용
          </button>
        </div>
      </div>
    </div>
  );
}
