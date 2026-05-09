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
import {
  clearReplicateByok,
  getReplicateByok,
  isValidReplicateKey,
  maskReplicateKey,
  setReplicateByok,
} from "@/lib/byok-replicate";

export default function SettingsPage() {
  const [keyInput, setKeyInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [consented, setConsented] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [savedConsent, setSavedConsent] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [repKeyInput, setRepKeyInput] = useState("");
  const [repReveal, setRepReveal] = useState(false);
  const [repConsented, setRepConsented] = useState(false);
  const [repSavedKey, setRepSavedKey] = useState("");
  const [repSavedConsent, setRepSavedConsent] = useState(false);
  const [repFeedback, setRepFeedback] = useState<string | null>(null);

  useEffect(() => {
    const s = getByok();
    setSavedKey(s.key);
    setSavedConsent(s.consented);
    setKeyInput(s.key);
    setConsented(s.consented);

    const r = getReplicateByok();
    setRepSavedKey(r.key);
    setRepSavedConsent(r.consented);
    setRepKeyInput(r.key);
    setRepConsented(r.consented);
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

  const repValid = isValidReplicateKey(repKeyInput);
  const repDirty =
    repKeyInput !== repSavedKey || repConsented !== repSavedConsent;

  const onRepSave = () => {
    if (repKeyInput && !repValid) {
      setRepFeedback(
        "토큰 형식이 맞지 않아요. r8_로 시작하는 36자 이상의 토큰이어야 해요.",
      );
      return;
    }
    if (repKeyInput && !repConsented) {
      setRepFeedback("토큰을 저장하려면 약관 동의에 체크해주세요.");
      return;
    }
    setReplicateByok(repKeyInput, repConsented);
    setRepSavedKey(repKeyInput);
    setRepSavedConsent(repConsented);
    setRepFeedback(
      repKeyInput
        ? "✅ 저장 완료 — LoRA 학습/애니메이션 호출 시 본인 토큰이 사용됩니다."
        : "✅ 토큰을 비웠어요 — Replicate 기능은 토큰 등록 후 이용할 수 있어요.",
    );
  };

  const onRepClear = () => {
    clearReplicateByok();
    setRepKeyInput("");
    setRepConsented(false);
    setRepSavedKey("");
    setRepSavedConsent(false);
    setRepFeedback("토큰을 완전히 삭제했어요.");
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

      <header className="pt-4">
        <h2 className="text-2xl font-bold">🎬 Replicate 토큰 (LoRA · 애니메이션)</h2>
        <p className="mt-1 text-sm text-base-content/70">
          <Link href="/lora" className="link link-primary">/lora</Link> (캐릭터 학습) ·{" "}
          <Link href="/animate" className="link link-primary">/animate</Link> (I2V 애니메이션)을 쓰려면
          본인 Replicate API 토큰이 필요해요. 사용량 비용은 직접 부담합니다.
        </p>
      </header>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <h2 className="card-title text-lg">토큰 등록</h2>

          {repSavedKey && repSavedConsent ? (
            <div className="alert alert-success text-xs">
              <span>
                ✅ 등록된 토큰: <code>{maskReplicateKey(repSavedKey)}</code> — 활성 (LoRA/애니메이션 호출 작동 확인)
              </span>
            </div>
          ) : repSavedKey ? (
            <div className="alert alert-warning text-xs">
              <span>
                토큰은 저장돼 있지만 약관 동의가 빠져있어 사용되지 않아요.
              </span>
            </div>
          ) : (
            <div className="alert text-xs">
              <span>등록된 토큰이 없어요. LoRA 학습과 애니메이션 기능을 사용하려면 토큰을 등록해주세요.</span>
            </div>
          )}

          <label className="form-control">
            <span className="label-text text-xs font-bold">
              Replicate API Token (r8_...)
            </span>
            <div className="join">
              <input
                type={repReveal ? "text" : "password"}
                value={repKeyInput}
                onChange={(e) => setRepKeyInput(e.target.value)}
                placeholder="r8_..."
                className="input input-bordered join-item w-full font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setRepReveal((v) => !v)}
                className="btn join-item"
                title="토큰 표시/숨김"
              >
                {repReveal ? "🙈" : "👁"}
              </button>
            </div>
            <span className="label-text-alt mt-1 text-[11px] text-base-content/60">
              발급:{" "}
              <a
                href="https://replicate.com/account/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="link link-primary"
              >
                replicate.com/account/api-tokens
              </a>{" "}
              · 형식: r8_로 시작하는 36자 이상
              {repKeyInput && !repValid && (
                <span className="ml-2 text-error">⚠️ 형식 오류</span>
              )}
              {repKeyInput && repValid && (
                <span className="ml-2 text-success">✓ 형식 정상</span>
              )}
            </span>
          </label>

          <label className="label cursor-pointer items-start justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-primary checkbox-sm mt-0.5"
              checked={repConsented}
              onChange={(e) => setRepConsented(e.target.checked)}
            />
            <span className="label-text text-xs">
              <strong>BYOK 정책에 동의해요.</strong>{" "}
              내 Replicate 토큰은 브라우저 localStorage에만 저장되고, LoRA 학습/애니메이션 호출 시
              서버는 패스스루(thin-proxy) 전용으로 토큰을 받아 Replicate에 전달만 하며 저장하거나 로그에 남기지 않아요.
              Replicate 사용량과 비용(크레딧 차감)은 내가 직접 부담하며, VibeMoji는 본인 토큰 사용으로 발생한 비용에 대해 책임을 지지 않습니다.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onRepSave}
              disabled={!repDirty}
              className="btn btn-primary btn-sm"
            >
              💾 저장
            </button>
            {repSavedKey && (
              <button onClick={onRepClear} className="btn btn-ghost btn-sm">
                🗑 토큰 완전 삭제
              </button>
            )}
            <Link href="/lora" className="btn btn-ghost btn-sm ml-auto">
              내 LoRA 학습 기록 보기 →
            </Link>
            <Link href="/animate" className="btn btn-ghost btn-sm">
              움직이는 이모티콘 만들기 →
            </Link>
          </div>

          {repFeedback && (
            <div className="alert text-xs">
              <span>{repFeedback}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card border border-dashed border-base-300 bg-base-100">
        <div className="card-body p-5 text-sm">
          <h3 className="font-bold">예상 비용 안내</h3>
          <ul className="mt-1 ml-4 list-disc space-y-1 text-xs text-base-content/70">
            <li>
              <strong>LoRA 학습</strong> — 회당 약 <code>$0.5</code> (캐릭터당 1회 학습으로 재사용)
            </li>
            <li>
              <strong>I2V 애니메이션 (Wan)</strong> — 클립당 약 <code>$0.05</code> · 가성비 모델
            </li>
            <li>
              <strong>I2V 애니메이션 (Kling)</strong> — 클립당 약 <code>$0.30</code> · 고품질 모델
            </li>
            <li>
              토큰 저장은 이 브라우저에만 적용. 다른 기기에서는 다시 등록해야 해요.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
