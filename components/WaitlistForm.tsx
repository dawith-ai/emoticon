"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDb, isFirebaseConfigured } from "@/lib/firebase/client";

type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState<"creator" | "business" | "fan">("creator");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setStatus("error");
      setMessage("개인정보 수집·이용 동의가 필요해요.");
      return;
    }
    setStatus("submitting");
    setMessage(null);

    const db = getClientDb();
    if (!db) {
      setStatus("error");
      setMessage("Firebase가 아직 설정되지 않았어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    try {
      await addDoc(collection(db, "public", "waitlist", "entries"), {
        email: email.trim().toLowerCase(),
        interest,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
        createdAt: serverTimestamp(),
      });
      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "전송에 실패했어요.");
    }
  };

  if (status === "success") {
    return (
      <div className="alert alert-success">
        <span>🎉 신청 완료! 베타 오픈 시 가장 먼저 알려드릴게요.</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="card border border-base-300 bg-base-100"
    >
      <div className="card-body p-5">
        <h3 className="card-title text-lg">🚀 베타 사용자 모집 중</h3>
        <p className="text-sm text-base-content/70">
          오픈 시 무료 크레딧 200개 + 얼리버드 50% 할인 쿠폰 드려요.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input input-bordered w-full"
          />
          <select
            value={interest}
            onChange={(e) => setInterest(e.target.value as typeof interest)}
            className="select select-bordered"
          >
            <option value="creator">이모티콘 작가 도전</option>
            <option value="business">브랜드 캐릭터 활용</option>
            <option value="fan">취미·팬덤</option>
          </select>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="checkbox checkbox-primary checkbox-xs"
          />
          <span>
            <a href="/privacy" className="link">개인정보처리방침</a>에 동의하고 베타 알림을 받아볼게요.
          </span>
        </label>
        {!isFirebaseConfigured && (
          <div className="alert alert-warning mt-2 text-xs">
            ⚠️ 현재 Firebase 환경변수가 설정되지 않아 데모 모드입니다. 실제 등록은 운영 배포 후 가능해요.
          </div>
        )}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="btn btn-primary mt-3 w-full"
        >
          {status === "submitting" ? "전송 중..." : "베타 알림 받기"}
        </button>
        {message && <p className="mt-2 text-xs text-error">{message}</p>}
      </div>
    </form>
  );
}
