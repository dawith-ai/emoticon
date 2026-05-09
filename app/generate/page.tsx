"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { getClientDb } from "@/lib/firebase/client";
import {
  EMOTIONS_32,
  buildSeedPrompt,
  buildVariantPrompt,
} from "@/lib/emotions";
import {
  getProvider,
  makeThrottle,
  type AIProviderId,
} from "@/lib/ai";
import {
  getByok,
  isValidGeminiKey,
  maskKey,
  setByok,
  clearByok,
} from "@/lib/byok";
import {
  generateWithLora,
  loadLoraRecords,
  type StoredLoraRecord,
} from "@/lib/ai/lora";
import { getActiveReplicateKey } from "@/lib/byok-replicate";

type Step = "input" | "seed" | "set" | "done";

const PROMPT_PRESETS = [
  "분홍 토끼, 둥글둥글한 스타일, 살짝 시크한 표정",
  "회색 곰돌이, 잠 많은 표정",
  "주황 줄무늬 고양이, 장난꾸러기",
  "보라 햄스터, 시니컬한 표정",
  "갈색 강아지, 활발하고 친근",
];

type SlotResult = {
  slot: number;
  label: string;
  blob?: Blob;
  url?: string;
  error?: string;
};

export default function GeneratePage() {
  const { user, configured } = useAuth();
  const [providerId, setProviderId] = useState<AIProviderId>("pollinations");
  const [step, setStep] = useState<Step>("input");
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0]);
  const [seed, setSeed] = useState<{ blob: Blob; url: string } | null>(null);
  const [variants, setVariants] = useState<SlotResult[]>([]);
  const [busy, setBusy] = useState<null | { phase: "seed" | "variant"; slot?: number; total?: number }>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // BYOK 인라인
  const [byokInput, setByokInput] = useState("");
  const [byokState, setByokStateLocal] = useState<{ hasKey: boolean; masked: string }>({
    hasKey: false,
    masked: "",
  });

  // LoRA 모드 — /lora 학습 후 ?lora=latest&trigger=X 로 진입 시 활성화
  const [activeLora, setActiveLora] = useState<StoredLoraRecord | null>(null);
  const [replicateReady, setReplicateReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("lora") !== "latest") {
      setActiveLora(null);
      return;
    }
    const wantedTrigger = params.get("trigger");
    const records = loadLoraRecords(user?.uid ?? null);
    const picked =
      (wantedTrigger
        ? records.find((r) => r.triggerWord === wantedTrigger)
        : null) ?? records[0] ?? null;
    setActiveLora(picked);
    setReplicateReady(!!getActiveReplicateKey());
  }, [user?.uid]);

  const deactivateLora = () => {
    setActiveLora(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("lora");
      url.searchParams.delete("trigger");
      window.history.replaceState({}, "", url.toString());
    }
  };
  const refreshByokView = () => {
    const { key, consented } = getByok();
    setByokStateLocal({
      hasKey: !!key && consented && isValidGeminiKey(key),
      masked: key ? maskKey(key) : "",
    });
  };
  useEffect(() => {
    refreshByokView();
  }, []);

  const projectIdRef = useRef<string | null>(null);
  const cancelRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (seed?.url) URL.revokeObjectURL(seed.url);
      variants.forEach((v) => v.url && URL.revokeObjectURL(v.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProvider = getProvider(providerId);
  const providerReady = !!activeProvider?.isReady();
  const ready = activeLora ? replicateReady : providerReady;

  const addLog = (line: string) => {
    setLog((prev) => [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${line}`]);
  };

  const saveByokInline = () => {
    const trimmed = byokInput.trim();
    if (!isValidGeminiKey(trimmed)) {
      setError("Gemini 키 형식이 올바르지 않아요. 'AIza' 로 시작하는 39자 이상이어야 해요.");
      return;
    }
    setByok(trimmed, true);
    setByokInput("");
    setError(null);
    refreshByokView();
    setProviderId("gemini");
    addLog("🔑 Gemini 키 등록 완료");
  };

  const removeByok = () => {
    clearByok();
    refreshByokView();
    addLog("🗑 Gemini 키 삭제");
  };

  const saveDraft = async (status: string) => {
    if (!user) return;
    const db = getClientDb();
    if (!db) return;
    setSaveState("saving");
    try {
      const payload = {
        title: prompt.slice(0, 48) || "무제 캐릭터",
        prompt,
        provider: providerId,
        status,
        variantCount: variants.filter((v) => v.blob).length,
        updatedAt: serverTimestamp(),
      };
      const id = projectIdRef.current;
      if (id) {
        await updateDoc(doc(db, "users", user.uid, "projects", id), payload);
      } else {
        const created = await addDoc(collection(db, "users", user.uid, "projects"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        projectIdRef.current = created.id;
      }
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveMessage(err instanceof Error ? err.message : "Firestore 저장 실패");
    }
  };

  const generateSeed = async () => {
    if (activeLora) {
      if (!getActiveReplicateKey()) {
        setError(
          "Replicate 토큰이 없어요. /lora 페이지에서 등록한 후 다시 진입해주세요.",
        );
        return;
      }
    } else {
      if (!activeProvider) return;
      if (!activeProvider.isReady()) {
        setError(
          activeProvider.auth === "byok-required"
            ? "Gemini 키가 없어요. 위 입력란에 붙여넣어 주세요. (1분 안에 받을 수 있어요)"
            : `${activeProvider.label} 사용 가능 상태가 아니에요.`
        );
        return;
      }
    }

    setBusy({ phase: "seed" });
    setError(null);
    setStep("seed");
    addLog(
      activeLora
        ? `🌱 시드 미리보기 생성 (LoRA · ${activeLora.triggerWord})`
        : `🌱 시드 생성 시작 (${activeProvider?.label ?? "?"})`,
    );

    try {
      const blob = activeLora
        ? await generateWithLora(
            activeLora.weights,
            `${activeLora.triggerWord} ${buildSeedPrompt(prompt)}`,
            { loraScale: 0.8, seed: hashSeed(prompt), width: 1024, height: 1024 },
          )
        : await activeProvider!.generate({
        prompt: buildSeedPrompt(prompt),
        width: 1024,
        height: 1024,
        seed: hashSeed(prompt),
        label: "seed",
      });
      const url = URL.createObjectURL(blob);
      setSeed((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { blob, url };
      });
      addLog(`✓ 시드 완료 (${(blob.size / 1024).toFixed(1)}KB)`);
      void saveDraft("seed_ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog(`❌ 시드 실패: ${msg}`);
      setStep("input");
    } finally {
      setBusy(null);
    }
  };

  const generateAll = async () => {
    if (!seed) return;
    if (!activeLora && !activeProvider) return;

    setBusy({ phase: "variant", slot: 0, total: 32 });
    setError(null);
    setStep("set");
    cancelRef.current = false;
    addLog(
      activeLora
        ? `🎨 32종 생성 시작 (LoRA · ${activeLora.triggerWord})`
        : `🎨 32종 생성 시작 (${activeProvider!.label})`,
    );
    void saveDraft("set_progress");

    const initial: SlotResult[] = EMOTIONS_32.map((e) => ({
      slot: e.slot,
      label: e.label,
    }));
    setVariants(initial);

    const throttle = activeLora ? null : makeThrottle(providerId);
    let success = 0;

    for (let i = 0; i < EMOTIONS_32.length; i++) {
      if (cancelRef.current) break;
      const emotion = EMOTIONS_32[i];
      setBusy({ phase: "variant", slot: i + 1, total: 32 });
      if (throttle) await throttle.wait();
      try {
        const variantPromptBase = buildVariantPrompt(
          prompt,
          emotion,
          activeLora ? true : activeProvider!.supportsReference,
        );
        const blob = activeLora
          ? await generateWithLora(
              activeLora.weights,
              `${activeLora.triggerWord} ${variantPromptBase}`,
              {
                loraScale: 0.8,
                seed: hashSeed(prompt) + emotion.slot,
                width: 1024,
                height: 1024,
              },
            )
          : await activeProvider!.generate({
          prompt: variantPromptBase,
          width: 1024,
          height: 1024,
          seed: hashSeed(prompt) + emotion.slot,
          referenceBlob: activeProvider!.supportsReference ? seed.blob : undefined,
          label: emotion.label,
        });
        const url = URL.createObjectURL(blob);
        setVariants((prev) =>
          prev.map((v) => (v.slot === emotion.slot ? { ...v, blob, url } : v))
        );
        success++;
        addLog(`✓ ${emotion.slot} ${emotion.label} (${(blob.size / 1024).toFixed(1)}KB)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setVariants((prev) =>
          prev.map((v) => (v.slot === emotion.slot ? { ...v, error: msg } : v))
        );
        addLog(`❌ ${emotion.slot} ${emotion.label}: ${msg}`);
      }
    }

    setBusy(null);
    setStep("done");
    addLog(`🎉 완료 — 성공 ${success}/32`);
    void saveDraft(`done_${success}_of_32`);
  };

  const cancel = () => {
    cancelRef.current = true;
    addLog("⏹ 사용자가 중지");
  };

  const reset = () => {
    if (seed?.url) URL.revokeObjectURL(seed.url);
    variants.forEach((v) => v.url && URL.revokeObjectURL(v.url));
    setSeed(null);
    setVariants([]);
    setStep("input");
    setError(null);
    setLog([]);
    projectIdRef.current = null;
    setSaveState("idle");
  };

  const downloadOne = (v: SlotResult) => {
    if (!v.blob || !v.url) return;
    const a = document.createElement("a");
    a.href = v.url;
    a.download = `${prompt.slice(0, 20).replace(/\s+/g, "_")}_${String(v.slot).padStart(2, "0")}_${v.label}.png`;
    a.click();
  };

  const downloadAll = async () => {
    const ready = variants.filter((v) => v.blob);
    if (ready.length === 0) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const safe = prompt.slice(0, 24).replace(/[^\w가-힣]/g, "_") || "vibemoji";
    for (const v of ready) {
      if (!v.blob) continue;
      zip.file(`${String(v.slot).padStart(2, "0")}-${v.label}.png`, v.blob);
    }
    if (seed?.blob) zip.file("seed.png", seed.blob);
    const out = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(out);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}_set.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">✨ AI 캐릭터 생성</h1>
        <Stepper current={step} />
      </div>

      {/* LoRA 모드 배너 */}
      {activeLora && (
        <div className="alert alert-success text-xs">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span>
              ✨ <strong>LoRA 모드 활성</strong> — 트리거 단어{" "}
              <code className="font-mono">{activeLora.triggerWord}</code>로 모든 32장이 같은 캐릭터로 생성됩니다.
            </span>
            {!replicateReady && (
              <span className="badge badge-warning badge-sm">⚠ Replicate 토큰 없음</span>
            )}
            <button onClick={deactivateLora} className="btn btn-ghost btn-xs ml-auto">
              일반 모드로
            </button>
          </div>
        </div>
      )}

      {/* 품질 비교 안내 */}
      {!activeLora && (
        <div className="alert text-xs">
          💡 <span className="font-bold">퀄리티 가이드:</span>{" "}
          🌸 <strong>Pollinations</strong> = 무료 즉시, 미리보기/연습용 ·
          ✨ <strong>Gemini (BYOK)</strong> = 무료 키 1분 발급, <strong>카카오 심사 통과 가능 수준</strong> ·
          <Link href="/lora" className="link link-primary ml-1">🎨 LoRA 학습</Link> = 시드 1장 → 32장 100% 일관 (Premium)
        </div>
      )}

      {/* Provider 선택 */}
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">AI 모델</span>
            <button
              onClick={() => setProviderId("pollinations")}
              className={`btn btn-sm ${providerId === "pollinations" ? "btn-primary" : "btn-ghost"}`}
            >
              🌸 Pollinations
            </button>
            <button
              onClick={() => setProviderId("gemini")}
              className={`btn btn-sm ${providerId === "gemini" ? "btn-primary" : "btn-ghost"}`}
            >
              ✨ Gemini {byokState.hasKey ? "(키 등록됨)" : "(BYOK 필요)"}
            </button>
          </div>
          <p className="mt-2 text-xs text-base-content/60">
            {activeProvider?.description ?? ""}
          </p>

          {/* Gemini 미준비 시 인라인 BYOK 가이드 */}
          {providerId === "gemini" && !byokState.hasKey && (
            <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <h3 className="text-sm font-bold">🔑 1분 만에 무료 키 받기</h3>
              <ol className="mt-1 list-decimal pl-5 text-xs leading-relaxed">
                <li>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary"
                  >
                    Google AI Studio
                  </a>
                  에 들어가서 [Create API key] 클릭
                </li>
                <li>키 복사 (AIza... 로 시작)</li>
                <li>아래 입력란에 붙여넣기 + 저장</li>
              </ol>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  type="password"
                  value={byokInput}
                  onChange={(e) => setByokInput(e.target.value)}
                  placeholder="AIza..."
                  className="input input-bordered input-sm w-full font-mono"
                />
                <button onClick={saveByokInline} className="btn btn-primary btn-sm">
                  키 저장 + 사용
                </button>
              </div>
              <p className="mt-1 text-[10px] text-base-content/60">
                🔒 키는 <strong>당신 브라우저 localStorage에만</strong> 저장돼요. 서버에 안 보내고, 호출도 브라우저 → Google 직접.
              </p>
            </div>
          )}

          {providerId === "gemini" && byokState.hasKey && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="badge badge-success badge-sm">✓ 키 등록됨</span>
              <code className="opacity-70">{byokState.masked}</code>
              <button onClick={removeByok} className="btn btn-ghost btn-xs ml-auto">
                키 삭제
              </button>
              <Link href="/settings" className="link link-primary">
                ⚙️ 상세 설정
              </Link>
            </div>
          )}

          {!activeProvider?.supportsReference && (
            <div className="alert mt-2 text-xs">
              ℹ️ {activeProvider?.label}는 reference image 미지원 — 32장이 매번 조금씩 다르게 그려질 수 있어요. 같은 캐릭터로 일관되게 32장이 필요하면 Gemini 사용.
            </div>
          )}
          {error && (
            <div className="alert alert-error mt-2 text-xs">
              <span>❌ {error}</span>
            </div>
          )}
        </div>
      </div>

      {!user && configured && (
        <div className="alert alert-info text-xs">
          <span>💡 로그인 안 해도 생성 가능. 로그인하면 작업 내역이 Firestore에 자동 저장돼요.</span>
          <Link href="/auth" className="btn btn-ghost btn-xs">로그인</Link>
        </div>
      )}
      {user && saveState !== "idle" && (
        <div className={`alert text-xs ${saveState === "error" ? "alert-error" : ""}`}>
          {saveState === "saving" ? "Firestore 저장 중..."
            : saveState === "saved" ? "Firestore에 자동 저장됨"
            : saveMessage}
        </div>
      )}

      {/* Step: input */}
      {step === "input" && (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h2 className="card-title">어떤 캐릭터를 만들고 싶나요?</h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="textarea textarea-bordered mt-2 h-28 w-full"
              placeholder="예: 분홍 토끼, 둥글둥글한 스타일, 살짝 시크한 표정"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {PROMPT_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  className="btn btn-ghost btn-xs"
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-base-content/60">
                시드 1장 호출 ({activeProvider?.cost.freeNote ?? ""})
              </p>
              <button
                onClick={generateSeed}
                disabled={!!busy || !ready}
                className="btn btn-primary"
              >
                {busy?.phase === "seed" ? "생성 중..." : "시드 만들기 →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: seed */}
      {step === "seed" && (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h2 className="card-title">시드 캐릭터</h2>
            <p className="text-sm text-base-content/70">
              {activeProvider?.supportsReference
                ? "이 시드를 reference로 32장 변형을 생성해요. 마음에 들 때까지 재생성하세요."
                : "이 시드 컨셉으로 32장 변형을 생성해요. (Reference 미지원이라 동일 캐릭터 보장은 어려움)"}
            </p>
            <div className="mt-4 flex justify-center">
              {seed ? (
                <img
                  src={seed.url}
                  alt="seed"
                  className="h-64 w-64 rounded-2xl bg-white object-contain shadow-lg"
                />
              ) : busy?.phase === "seed" ? (
                <div className="flex h-64 w-64 items-center justify-center">
                  <span className="loading loading-dots loading-lg" />
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setStep("input")} className="btn btn-ghost">
                ← 다시 입력
              </button>
              <div className="flex gap-2">
                <button
                  onClick={generateSeed}
                  disabled={!!busy || !ready}
                  className="btn btn-outline"
                >
                  🔄 재생성
                </button>
                <button
                  onClick={generateAll}
                  disabled={!!busy || !seed}
                  className="btn btn-primary"
                >
                  32종 생성하기 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step: set / done — 32 grid */}
      {(step === "set" || step === "done") && (
        <div className="space-y-3">
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body p-4">
              <div className="flex items-center justify-between">
                <h2 className="card-title text-lg">
                  {step === "set" ? "생성 중..." : "✅ 완료"}
                </h2>
                <span className="badge badge-primary">
                  {variants.filter((v) => v.blob).length} / 32
                </span>
              </div>
              {busy?.phase === "variant" && (
                <progress
                  className="progress progress-primary w-full"
                  value={busy.slot ?? 0}
                  max={busy.total ?? 32}
                />
              )}
              {step === "set" && busy && (
                <p className="text-xs text-base-content/60">
                  {providerId === "gemini"
                    ? "Gemini 무료 티어 호출 간격 6.5초. 32장 = 약 3-4분 소요."
                    : "Pollinations 호출 간격 1초. 32장 = 약 1-2분 소요."}
                </p>
              )}

              <div className="mt-3 grid grid-cols-4 gap-2 md:grid-cols-8">
                {EMOTIONS_32.map((e) => {
                  const v = variants.find((x) => x.slot === e.slot);
                  return (
                    <div
                      key={e.slot}
                      className={`sticker-tile relative flex flex-col items-center justify-center overflow-hidden ${v?.blob ? "filled" : ""} ${v?.error ? "border-error" : ""}`}
                      title={v?.error ?? `${e.slot}. ${e.label}`}
                      onClick={() => v?.blob && downloadOne(v)}
                      style={{ cursor: v?.blob ? "pointer" : "default" }}
                    >
                      {v?.url ? (
                        <img
                          src={v.url}
                          alt={e.label}
                          className="h-full w-full object-contain"
                        />
                      ) : v?.error ? (
                        <span className="text-xs text-error">실패</span>
                      ) : busy?.phase === "variant" && busy.slot === e.slot ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : null}
                      <span className="absolute bottom-0.5 text-[9px] text-base-content/60 bg-base-100/70 px-1 rounded">
                        {e.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {busy && (
                <button onClick={cancel} className="btn btn-error btn-sm mt-3 self-start">
                  ⏹ 중지
                </button>
              )}
            </div>
          </div>

          {step === "done" && (
            <div className="card border border-success/30 bg-success/5">
              <div className="card-body">
                <h3 className="card-title text-success">
                  🎉 32장 세트 생성 완료
                </h3>
                <p className="text-sm">
                  슬롯 클릭 → 개별 PNG 다운로드. 또는 ZIP으로 일괄 다운로드 후
                  사이즈 변환기에서 카카오/OGQ/라인/Etsy 사양으로 자동 변환하세요.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={downloadAll} className="btn btn-primary btn-sm">
                    ⬇ 전체 ZIP 다운로드
                  </button>
                  <Link href="/tools/resize" className="btn btn-outline btn-sm">
                    📐 사이즈 변환기로 →
                  </Link>
                  <Link href="/marketplace" className="btn btn-warning btn-sm">
                    💰 수익화 허브
                  </Link>
                  <button onClick={reset} className="btn btn-ghost btn-sm">
                    새로 만들기
                  </button>
                </div>
              </div>
            </div>
          )}

          {log.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-base-content/60">
                📜 호출 로그 ({log.length})
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-base-200 p-2">
                {log.join("\n")}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "input", label: "입력" },
    { key: "seed", label: "시드" },
    { key: "set", label: "32종" },
    { key: "done", label: "완료" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <ul className="steps steps-horizontal hidden md:flex">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={`step ${i <= currentIdx ? "step-primary" : ""}`}
        >
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** prompt를 결정론적 정수 시드로 변환 — Pollinations 재현성 */
function hashSeed(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 1_000_000;
}
