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
  listProviders,
  makeThrottle,
  type AIProviderId,
} from "@/lib/ai";

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

  const projectIdRef = useRef<string | null>(null);
  const cancelRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // 새로 unmount/모드 변경 시 blob URL 정리
  useEffect(() => {
    return () => {
      if (seed?.url) URL.revokeObjectURL(seed.url);
      variants.forEach((v) => v.url && URL.revokeObjectURL(v.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providers = listProviders();
  const activeProvider = providerId === "mock" ? null : getProvider(providerId);
  const providerReady = providerId === "mock" ? true : !!activeProvider?.isReady();

  const addLog = (line: string) => {
    setLog((prev) => [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${line}`]);
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
    if (providerId === "mock") {
      // mock — 그냥 step 전환, 시드 placeholder
      setStep("seed");
      void saveDraft("mock_seed");
      return;
    }
    if (!activeProvider) return;
    if (!activeProvider.isReady()) {
      setError(
        activeProvider.auth === "byok-required"
          ? "Gemini 키가 없어요. /settings에서 BYOK 키를 등록한 뒤 다시 시도해주세요."
          : `${activeProvider.label} 사용 가능 상태가 아니에요.`
      );
      return;
    }

    setBusy({ phase: "seed" });
    setError(null);
    setStep("seed");
    addLog(`🌱 시드 생성 시작 (${activeProvider.label})`);

    try {
      const blob = await activeProvider.generate({
        prompt: buildSeedPrompt(prompt),
        width: 512,
        height: 512,
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
    if (providerId === "mock") {
      // mock 진행 애니메이션 — 32 placeholder
      setStep("set");
      void saveDraft("mock_set_progress");
      const placeholders: SlotResult[] = EMOTIONS_32.map((e) => ({
        slot: e.slot,
        label: e.label,
      }));
      setVariants(placeholders);
      let i = 0;
      const tick = () => {
        if (i >= 32) {
          setStep("done");
          void saveDraft("mock_done");
          return;
        }
        const next = i + 1;
        setVariants((prev) =>
          prev.map((v, k) => (k < next ? { ...v, blob: undefined, url: "MOCK" } : v))
        );
        i = next;
        setTimeout(tick, 80);
      };
      tick();
      return;
    }

    if (!activeProvider || !seed) return;

    setBusy({ phase: "variant", slot: 0, total: 32 });
    setError(null);
    setStep("set");
    cancelRef.current = false;
    addLog(`🎨 32종 생성 시작 (${activeProvider.label})`);
    void saveDraft("set_progress");

    const initial: SlotResult[] = EMOTIONS_32.map((e) => ({
      slot: e.slot,
      label: e.label,
    }));
    setVariants(initial);

    const throttle = makeThrottle(providerId);
    let success = 0;

    for (let i = 0; i < EMOTIONS_32.length; i++) {
      if (cancelRef.current) break;
      const emotion = EMOTIONS_32[i];
      setBusy({ phase: "variant", slot: i + 1, total: 32 });
      await throttle.wait();
      try {
        const variantPrompt = buildVariantPrompt(
          prompt,
          emotion,
          activeProvider.supportsReference,
        );
        const blob = await activeProvider.generate({
          prompt: variantPrompt,
          width: 512,
          height: 512,
          seed: hashSeed(prompt) + emotion.slot,
          referenceBlob: activeProvider.supportsReference ? seed.blob : undefined,
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
    variants.forEach((v) => v.url && v.url !== "MOCK" && URL.revokeObjectURL(v.url));
    setSeed(null);
    setVariants([]);
    setStep("input");
    setError(null);
    setLog([]);
    projectIdRef.current = null;
    setSaveState("idle");
  };

  const downloadOne = (v: SlotResult) => {
    if (!v.blob || !v.url || v.url === "MOCK") return;
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

      {/* Provider 선택 */}
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">AI 모델</span>
            <button
              onClick={() => setProviderId("pollinations")}
              className={`btn btn-xs ${providerId === "pollinations" ? "btn-primary" : "btn-ghost"}`}
            >
              🌸 Pollinations (즉시·무료)
            </button>
            <button
              onClick={() => setProviderId("gemini")}
              className={`btn btn-xs ${providerId === "gemini" ? "btn-primary" : "btn-ghost"}`}
            >
              ✨ Gemini (BYOK·무료티어)
            </button>
            <button
              onClick={() => setProviderId("mock")}
              className={`btn btn-xs ${providerId === "mock" ? "btn-primary" : "btn-ghost"}`}
            >
              🎭 Mock
            </button>
            <Link href="/settings" className="link link-primary ml-auto text-xs">
              ⚙️ BYOK 설정
            </Link>
          </div>
          <p className="mt-1 text-xs text-base-content/60">
            {activeProvider?.description ??
              "Mock — 실제 호출 없이 UI만 시뮬레이션"}
          </p>
          {providerId === "gemini" && !providerReady && (
            <div className="alert alert-warning mt-2 text-xs">
              ⚠️ Gemini 키가 없어요. <Link href="/settings" className="link">/settings</Link>에서 BYOK 키를 등록하면 즉시 사용 가능해요. (Google AI Studio 무료 키 OK)
            </div>
          )}
          {!activeProvider?.supportsReference && providerId !== "mock" && (
            <div className="alert text-xs">
              ℹ️ {activeProvider?.label}는 reference image 미지원이라 32장 캐릭터 일관성이 약할 수 있어요. 디테일이 적은 캐릭터에 유리해요.
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
                {providerId === "mock"
                  ? "Mock 모드 — 실제 호출 없음"
                  : `시드 1장 호출 (${activeProvider?.cost.freeNote ?? ""})`}
              </p>
              <button
                onClick={generateSeed}
                disabled={!!busy || !providerReady}
                className="btn btn-primary"
              >
                {busy?.phase === "seed" ? "생성 중..." : "시드 만들기 →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: seed (mock placeholder OR real image) */}
      {step === "seed" && (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h2 className="card-title">시드 캐릭터</h2>
            <p className="text-sm text-base-content/70">
              {providerId === "mock"
                ? "Mock 모드 — placeholder. 실제 모델로 바꾸려면 위에서 Pollinations 또는 Gemini 선택."
                : activeProvider?.supportsReference
                  ? "이 시드를 reference로 32장 변형을 생성해요. 마음에 들 때까지 재생성하세요."
                  : "이 시드 컨셉으로 32장 변형을 생성해요. (Reference 미지원이라 동일 캐릭터 보장은 어려움)"}
            </p>
            <div className="mt-4 flex justify-center">
              {seed && providerId !== "mock" ? (
                <img
                  src={seed.url}
                  alt="seed"
                  className="h-64 w-64 rounded-2xl bg-white object-contain shadow-lg"
                />
              ) : providerId === "mock" ? (
                <div className="sticker-tile filled flex h-64 w-64 items-center justify-center text-7xl">
                  🐰
                </div>
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
                  disabled={!!busy || !providerReady}
                  className="btn btn-outline"
                >
                  🔄 재생성
                </button>
                <button
                  onClick={generateAll}
                  disabled={!!busy || (providerId !== "mock" && !seed)}
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
                  {variants.filter((v) => v.blob || v.url === "MOCK").length} / 32
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
                    : providerId === "pollinations"
                      ? "Pollinations 호출 간격 1초. 32장 = 약 1-2분 소요."
                      : ""}
                </p>
              )}

              <div className="mt-3 grid grid-cols-4 gap-2 md:grid-cols-8">
                {EMOTIONS_32.map((e) => {
                  const v = variants.find((x) => x.slot === e.slot);
                  const filled = v?.blob || v?.url === "MOCK";
                  return (
                    <div
                      key={e.slot}
                      className={`sticker-tile relative flex flex-col items-center justify-center overflow-hidden ${filled ? "filled" : ""} ${v?.error ? "border-error" : ""}`}
                      title={v?.error ?? `${e.slot}. ${e.label}`}
                      onClick={() => v?.blob && downloadOne(v)}
                      style={{ cursor: v?.blob ? "pointer" : "default" }}
                    >
                      {v?.url && v.url !== "MOCK" ? (
                        <img
                          src={v.url}
                          alt={e.label}
                          className="h-full w-full object-contain"
                        />
                      ) : v?.url === "MOCK" ? (
                        <span className="text-3xl">🐰</span>
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
