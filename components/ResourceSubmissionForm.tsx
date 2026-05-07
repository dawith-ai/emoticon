"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDb, isFirebaseConfigured } from "@/lib/firebase/client";

type Status = "idle" | "submitting" | "success" | "error";

const KINDS = [
  { id: "brushset", label: "브러시·도장 (Procreate)" },
  { id: "pdf", label: "가이드 PDF" },
  { id: "image", label: "참고 이미지·템플릿" },
  { id: "tool", label: "온라인 도구" },
  { id: "tutorial", label: "튜토리얼·강의" },
  { id: "etc", label: "기타" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

export function ResourceSubmissionForm() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<Kind>("brushset");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setStatus("error");
      setMessage("원작자 동의/링크 권한 확인 체크가 필요해요.");
      return;
    }
    if (title.trim().length < 2) {
      setStatus("error");
      setMessage("자료 이름이 너무 짧아요.");
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setStatus("error");
      setMessage("자료 URL은 http(s):// 로 시작해야 해요.");
      return;
    }

    setStatus("submitting");
    setMessage(null);

    const db = getClientDb();
    if (!db) {
      setStatus("error");
      setMessage(
        "Firebase가 아직 설정되지 않았어요. 잠시 후 다시 시도해주세요."
      );
      return;
    }
    try {
      await addDoc(
        collection(db, "public", "resource_submissions", "items"),
        {
          title: title.trim().slice(0, 120),
          url: url.trim().slice(0, 500),
          kind,
          author: author.trim().slice(0, 80),
          note: note.trim().slice(0, 400),
          contactEmail: contactEmail.trim().toLowerCase().slice(0, 120),
          userAgent:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 200)
              : "",
          createdAt: serverTimestamp(),
        }
      );
      setStatus("success");
      setTitle("");
      setUrl("");
      setAuthor("");
      setNote("");
      setContactEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "전송에 실패했어요.");
    }
  };

  if (status === "success") {
    return (
      <div className="alert alert-success">
        <span>
          🙏 제보 감사합니다! 검수 후 큐레이션에 반영하고, 입력하신 이메일로
          확인 알림을 드릴게요.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 text-sm">
      <h3 className="font-bold text-base-content">📨 신규 자료 제보</h3>
      <p className="text-xs text-base-content/60">
        원작자의 명시 동의/공개 링크 자료만 받아요. 검수 후 출처 명기 + 사용법
        정리해서 큐레이션에 추가합니다.
      </p>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="자료 이름 (예: 동동작가 표정 가이드 PNG)"
          className="input input-bordered input-sm w-full"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          className="select select-bordered select-sm"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <input
        required
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="자료 URL (https://…)"
        className="input input-bordered input-sm w-full"
      />

      <div className="grid gap-2 md:grid-cols-2">
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="원작자 이름/SNS (선택)"
          className="input input-bordered input-sm w-full"
        />
        <input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="연락 받을 이메일 (선택)"
          className="input input-bordered input-sm w-full"
        />
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="간단한 설명 / 추천 이유 (선택)"
        className="textarea textarea-bordered textarea-sm w-full"
        rows={2}
      />

      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="checkbox checkbox-primary checkbox-xs mt-0.5"
        />
        <span>
          원작자가 공개·재공유에 동의했거나 본인 제작 자료입니다. 입력 정보는{" "}
          <a href="/privacy" className="link">
            개인정보처리방침
          </a>{" "}
          에 따라 처리되며, 검수 외 목적으로 사용하지 않아요.
        </span>
      </label>

      {!isFirebaseConfigured && (
        <div className="alert alert-warning text-xs">
          ⚠️ 현재 Firebase가 설정되지 않아 데모 모드입니다. 실제 등록은 운영
          배포 후 가능해요.
        </div>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="btn btn-primary btn-sm w-full md:w-auto"
      >
        {status === "submitting" ? "전송 중..." : "제보 보내기"}
      </button>
      {message && <p className="text-xs text-error">{message}</p>}
    </form>
  );
}
