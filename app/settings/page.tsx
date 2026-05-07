"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  clearByok,
  getByok,
  isValidGeminiKey,
  maskKey,
  setByok,
} from "@/lib/byok";

export default function SettingsPage() {
  const [keyInput, setKeyInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [consented, setConsented] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [savedConsent, setSavedConsent] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const s = getByok();
    setSavedKey(s.key);
    setSavedConsent(s.consented);
    setKeyInput(s.key);
    setConsented(s.consented);
  }, []);

  const valid = isValidGeminiKey(keyInput);
  const dirty = keyInput !== savedKey || consented !== savedConsent;

  const onSave = () => {
    if (keyInput && !valid) {
      setFeedback("키 형식이 맞지 않아요. AIza로 시작하는 39자 키를 입력해주세요.");
      return;
    }
    if (keyInput && !consented) {
      setFeedback("키를 저장하려면 약관 동의에 체크해주세요.");
      return;
    }
    setByok(keyInput, consented);
    setSavedKey(keyInput);
    setSavedConsent(consented);
    setFeedback(
      keyInput
        ? "✅ 저장 완료 — 다음 생성부터 본인 키가 사용되며 크레딧이 차감되지 않아요."
        : "✅ 키를 비웠어요 — 다음 생성부터 운영자 키 + 크레딧 모드로 돌아갑니다.",
    );
  };

  const onClear = () => {
    clearByok();
    setKeyInput("");
    setConsented(false);
    setSavedKey("");
    setSavedConsent(false);
    setFeedback("키를 완전히 삭제했어요.");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">⚙️ 설정 — BYOK (내 Gemini 키)</h1>
        <p className="mt-1 text-sm text-base-content/70">
          본인 Gemini API 키를 등록하면 <strong>크레딧 차감 없이 무제한 생성</strong>이 가능해요.
          파워 유저나 평가용으로 쓸 때 유용합니다.
        </p>
      </header>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <h2 className="card-title text-lg">키 등록</h2>

          {savedKey && savedConsent ? (
            <div className="alert alert-success text-xs">
              <span>
                ✅ 현재 등록된 키: <code>{maskKey(savedKey)}</code> — 활성
              </span>
            </div>
          ) : savedKey ? (
            <div className="alert alert-warning text-xs">
              <span>
                키는 저장돼 있지만 약관 동의가 빠져있어 사용되지 않아요.
              </span>
            </div>
          ) : (
            <div className="alert text-xs">
              <span>등록된 키가 없어요. 운영자 키 + 크레딧 모드로 동작 중.</span>
            </div>
          )}

          <label className="form-control">
            <span className="label-text text-xs font-bold">
              Gemini API Key (AIza...)
            </span>
            <div className="join">
              <input
                type={reveal ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="input input-bordered join-item w-full font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="btn join-item"
                title="키 표시/숨김"
              >
                {reveal ? "🙈" : "👁"}
              </button>
            </div>
            <span className="label-text-alt mt-1 text-[11px] text-base-content/60">
              발급:{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="link link-primary"
              >
                aistudio.google.com/apikey
              </a>{" "}
              · 형식: AIza로 시작하는 39자
              {keyInput && !valid && (
                <span className="ml-2 text-error">⚠️ 형식 오류</span>
              )}
              {keyInput && valid && (
                <span className="ml-2 text-success">✓ 형식 정상</span>
              )}
            </span>
          </label>

          <label className="label cursor-pointer items-start justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-primary checkbox-sm mt-0.5"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
            />
            <span className="label-text text-xs">
              <strong>개인 키 사용 약관에 동의해요.</strong>{" "}
              내 키는 브라우저 localStorage에만 저장되고, 생성 호출 시에만 서버로 전송됩니다.
              서버는 키를 저장하거나 로그에 남기지 않아요. Gemini 사용량과 비용은 내가 직접 부담하며,
              VibeMoji는 운영자 키 사용량이 0인 호출(BYOK)에 대해 책임을 지지 않습니다.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onSave}
              disabled={!dirty}
              className="btn btn-primary btn-sm"
            >
              💾 저장
            </button>
            {savedKey && (
              <button onClick={onClear} className="btn btn-ghost btn-sm">
                🗑 키 완전 삭제
              </button>
            )}
            <Link href="/generate" className="btn btn-ghost btn-sm ml-auto">
              생성 페이지로 →
            </Link>
          </div>

          {feedback && (
            <div className="alert text-xs">
              <span>{feedback}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card border border-dashed border-base-300 bg-base-100">
        <div className="card-body p-5 text-sm">
          <h3 className="font-bold">왜 BYOK가 필요한가요?</h3>
          <ul className="mt-1 ml-4 list-disc space-y-1 text-xs text-base-content/70">
            <li>
              운영자(VibeMoji) 키는 무료 크레딧 5장(시드 1회 체험) 후 결제 필요. BYOK는 무제한.
            </li>
            <li>
              평가/연구 목적, 또는 한 번에 여러 캐릭터를 시도해보고 싶은 파워 유저에게 적합.
            </li>
            <li>
              Gemini 무료 티어는 일일 한도가 낮고 데이터가 학습에 사용될 수 있어 주의.
              유료(Pay-as-you-go)로 전환하는 것을 권장합니다 (신규 가입 시 $300 크레딧 제공).
            </li>
            <li>
              키 저장은 이 브라우저에만 적용. 다른 기기에서는 다시 등록해야 해요.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
