"use client";

/**
 * 32장 일괄 애니메이션 (Batch I2V) 페이지 — VibeMoji 핵심 차별점.
 *
 * 흐름:
 *   1) 32장 정적 이모티콘 입력
 *      - (a) 직접 업로드 (1~32장, 슬롯에 자동 매칭)
 *      - (b) /generate 핸드오프: ?source=generate 시 sessionStorage에서 로드
 *   2) 모델 선택 (Wan Fast / Kling) + 글로벌 모션 프롬프트 + GIF 변환 토글
 *   3) BYOK Replicate 토큰 확인
 *   4) "32장 일괄 애니메이션 시작" → 동시 N개 워커가 병렬 처리
 *   5) 슬롯별 진행 상태 그리드 + 전체 진행률
 *   6) 완료 후: ZIP 다운로드 (MP4+GIF / GIF만 / MP4만)
 *
 * 운영자 비용 0 — 모든 ffmpeg 변환은 사용자 브라우저에서, Replicate 호출은 BYOK.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EMOTIONS_32, type EmotionDef } from "@/lib/emotions";
import {
  clearReplicateByok,
  getReplicateByok,
  isValidReplicateKey,
  maskReplicateKey,
  setReplicateByok,
} from "@/lib/byok-replicate";
import type { AnimateModel } from "@/lib/ai/i2v";
import {
  batchAnimate,
  downloadBatchAsZip,
  estimateBatchCost,
  type BatchItem,
  type BatchResult,
} from "@/lib/ai/batch-animate";
import { BatchAnimateGrid } from "@/components/BatchAnimateGrid";

const SESSION_KEY = "vibemoji.batch.frames";
const TOTAL_SLOTS = EMOTIONS_32.length;
const DEFAULT_PROMPT = "subtle natural motion, gentle expression change, looped";
const DEFAULT_CONCURRENCY = 2;

const MODEL_OPTIONS: ReadonlyArray<{
  key: AnimateModel;
  label: string;
  perClip: string;
  desc: string;
}> = [
  {
    key: "wan-fast",
    label: "Wan 2.2 i2v Fast",
    perClip: "$0.05",
    desc: "5초·480p, 가장 저렴. 32장 일괄 추천.",
  },
  {
    key: "kling",
    label: "Kling v2.0",
    perClip: "$0.30",
    desc: "프레임 품질 우수, 비쌈.",
  },
];

type RunStatus = "idle" | "running" | "succeeded" | "failed" | "canceled";

interface SlotInput {
  slot: number;
  label: string;
  blob: Blob | null;
  /** 미리보기 objectURL (메모리 회수 대상) */
  url: string | null;
  /** 파일명 — 핸드오프 또는 업로드 시 보존 */
  fileName?: string;
}

function makeEmptyInputs(): SlotInput[] {
  return EMOTIONS_32.map((e: EmotionDef) => ({
    slot: e.slot,
    label: e.label,
    blob: null,
    url: null,
  }));
}

interface SessionFrame {
  slot: number;
  label?: string;
  /** data URL (data:image/png;base64,...) */
  dataUrl: string;
}

function isSessionFrame(value: unknown): value is SessionFrame {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.slot === "number" &&
    typeof obj.dataUrl === "string" &&
    obj.dataUrl.startsWith("data:")
  );
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export default function AnimateBatchPage() {
  // 입력 슬롯 (항상 32 길이)
  const [inputs, setInputs] = useState<SlotInput[]>(makeEmptyInputs);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  // 옵션
  const [model, setModel] = useState<AnimateModel>("wan-fast");
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [convertGif, setConvertGif] = useState<boolean>(true);
  const [concurrency, setConcurrency] = useState<number>(DEFAULT_CONCURRENCY);

  // BYOK
  const [byokInput, setByokInput] = useState<string>("");
  const [byokConsent, setByokConsent] = useState<boolean>(false);
  const [byokView, setByokView] = useState<{ hasKey: boolean; masked: string }>({
    hasKey: false,
    masked: "",
  });
  const [byokError, setByokError] = useState<string | null>(null);

  // 실행
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [results, setResults] = useState<BatchResult[]>([]);
  const [doneCount, setDoneCount] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 드래그 앤 드롭 상태 (전체 멀티 업로드 영역)
  const dragCounterRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const refreshByokView = () => {
    const { key, consented } = getReplicateByok();
    setByokView({
      hasKey: !!key && consented && isValidReplicateKey(key),
      masked: key ? maskReplicateKey(key) : "",
    });
  };

  useEffect(() => {
    refreshByokView();
  }, []);

  // /generate 핸드오프 — ?source=generate 시 sessionStorage에서 32장 로드
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "generate") return;

    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      setHandoffError(
        "핸드오프 데이터가 없어요. /generate 페이지에서 32장을 먼저 만들어 주세요.",
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setHandoffError("핸드오프 데이터를 읽을 수 없어요 (JSON 파싱 실패).");
      return;
    }
    if (!Array.isArray(parsed)) {
      setHandoffError("핸드오프 데이터 형식이 올바르지 않아요.");
      return;
    }
    const frames = parsed.filter(isSessionFrame);
    if (frames.length === 0) {
      setHandoffError("유효한 프레임이 없어요.");
      return;
    }

    void (async () => {
      const next = makeEmptyInputs();
      let loaded = 0;
      for (const frame of frames) {
        const idx = next.findIndex((s) => s.slot === frame.slot);
        if (idx < 0) continue;
        try {
          const blob = await dataUrlToBlob(frame.dataUrl);
          const url = URL.createObjectURL(blob);
          next[idx] = {
            ...next[idx],
            blob,
            url,
            fileName: `slot-${frame.slot}.png`,
          };
          loaded += 1;
        } catch {
          // 슬롯 로드 실패 — 무시하고 진행
        }
      }
      setInputs(next);
      setHandoffNote(`✅ /generate에서 ${loaded}/${TOTAL_SLOTS}장 자동 로드 완료`);
    })();
  }, []);

  // objectURL 정리
  useEffect(() => {
    return () => {
      inputs.forEach((s) => {
        if (s.url) URL.revokeObjectURL(s.url);
      });
    };
    // 마운트 시점 inputs만 정리 — 신규는 setInputs에서 prev.url 회수.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filledCount = useMemo(
    () => inputs.filter((s) => s.blob !== null).length,
    [inputs],
  );

  const cost = useMemo(() => estimateBatchCost(filledCount, model), [filledCount, model]);

  const canStart = useMemo(() => {
    if (filledCount === 0) return false;
    if (!byokView.hasKey) return false;
    if (runStatus === "running") return false;
    return true;
  }, [filledCount, byokView.hasKey, runStatus]);

  // ─── 업로드 핸들러 ───────────────────────────────────────────────

  const assignFiles = (files: ReadonlyArray<File>) => {
    if (files.length === 0) return;
    setInputs((prev) => {
      const next = prev.map((s) => ({ ...s }));
      let cursor = 0;
      // 빈 슬롯을 앞에서부터 채움. 32장 초과는 잘라냄.
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        // 빈 슬롯 찾기
        while (cursor < next.length && next[cursor].blob !== null) cursor += 1;
        if (cursor >= next.length) break;
        if (next[cursor].url) URL.revokeObjectURL(next[cursor].url!);
        const url = URL.createObjectURL(file);
        next[cursor] = {
          ...next[cursor],
          blob: file,
          url,
          fileName: file.name,
        };
        cursor += 1;
      }
      return next;
    });
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    assignFiles(Array.from(list));
    // input value 리셋 (같은 파일 재선택 가능)
    e.target.value = "";
  };

  const onDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
    }
  };
  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const list = e.dataTransfer.files;
    if (!list) return;
    assignFiles(Array.from(list));
  };

  const removeSlot = (slot: number) => {
    setInputs((prev) =>
      prev.map((s) => {
        if (s.slot !== slot) return s;
        if (s.url) URL.revokeObjectURL(s.url);
        return { slot: s.slot, label: s.label, blob: null, url: null };
      }),
    );
  };

  const clearAllInputs = () => {
    abortRef.current?.abort();
    setInputs((prev) => {
      prev.forEach((s) => {
        if (s.url) URL.revokeObjectURL(s.url);
      });
      return makeEmptyInputs();
    });
    setResults([]);
    setDoneCount(0);
    setRunStatus("idle");
    setErrorMsg(null);
  };

  // ─── BYOK ───────────────────────────────────────────────────────

  const saveByokInline = () => {
    const trimmed = byokInput.trim();
    if (!isValidReplicateKey(trimmed)) {
      setByokError("Replicate 토큰 형식이 올바르지 않아요. 'r8_'로 시작해야 해요.");
      return;
    }
    if (!byokConsent) {
      setByokError("약관에 동의해 주세요.");
      return;
    }
    setReplicateByok(trimmed, true);
    setByokInput("");
    setByokError(null);
    refreshByokView();
  };

  const removeByok = () => {
    clearReplicateByok();
    refreshByokView();
  };

  // ─── 실행 ───────────────────────────────────────────────────────

  const start = async () => {
    setErrorMsg(null);
    setResults([]);
    setDoneCount(0);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const items: BatchItem[] = inputs
      .filter((s): s is SlotInput & { blob: Blob } => s.blob !== null)
      .map((s) => ({ slot: s.slot, label: s.label, image: s.blob }));

    if (items.length === 0) {
      setErrorMsg("애니메이션할 이미지가 없어요. 먼저 업로드해 주세요.");
      return;
    }

    setRunStatus("running");

    try {
      const out = await batchAnimate(items, {
        model,
        prompt,
        concurrency,
        convertGif,
        signal: ctrl.signal,
        onProgress: (done, _total, current) => {
          setDoneCount(done);
          if (current) {
            setResults((prev) => {
              const idx = prev.findIndex((r) => r.slot === current.slot);
              if (idx < 0) return [...prev, current];
              const next = prev.slice();
              next[idx] = current;
              return next;
            });
          }
        },
      });
      setResults(out);

      const allCanceled = out.every(
        (r) => r.status === "canceled" || r.status === "pending",
      );
      const anyFailed = out.some((r) => r.status === "failed");
      if (ctrl.signal.aborted || allCanceled) {
        setRunStatus("canceled");
      } else if (anyFailed && out.every((r) => r.status !== "succeeded")) {
        setRunStatus("failed");
      } else {
        setRunStatus("succeeded");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setErrorMsg(msg);
      setRunStatus(ctrl.signal.aborted ? "canceled" : "failed");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  // ─── 다운로드 ───────────────────────────────────────────────────

  const downloadZip = async (kind: "all" | "gif" | "mp4") => {
    if (results.length === 0) return;
    try {
      const blob = await downloadBatchAsZip(results, {
        includeMp4: kind !== "gif",
        includeGif: kind !== "mp4",
        namePrefix: "vibemoji",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = kind === "all" ? "all" : kind;
      a.download = `vibemoji_batch_${suffix}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ZIP 생성 실패";
      setErrorMsg(msg);
    }
  };

  const successCount = useMemo(
    () => results.filter((r) => r.status === "succeeded").length,
    [results],
  );
  const totalProgress = TOTAL_SLOTS > 0 ? Math.round((doneCount / Math.max(filledCount, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">🎞 32장 일괄 애니메이션</h1>
          <span className="badge badge-secondary">Batch I2V · Beta</span>
          <span className="badge badge-primary badge-outline">한국 시장 최초</span>
        </div>
        <p className="text-sm text-base-content/70">
          정적 32장을 한 번에 움직이는 GIF로 변환해요. 카카오 “움직이는 이모티콘”은
          정확히 32장 묶음 — 한 슬롯씩 32번 돌리지 않고 전부 자동.
        </p>
      </header>

      {handoffError && (
        <div className="alert alert-warning text-sm">⚠ {handoffError}</div>
      )}
      {handoffNote && (
        <div className="alert alert-success text-sm">{handoffNote}</div>
      )}

      {/* BYOK */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-2">
          <h2 className="card-title text-base">🔑 Replicate 토큰 (BYOK)</h2>
          {byokView.hasKey ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                등록된 키: <code className="font-mono">{byokView.masked}</code>
              </p>
              <button
                type="button"
                onClick={removeByok}
                className="btn btn-ghost btn-xs"
              >
                삭제
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-base-content/70">
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-primary"
                >
                  replicate.com/account/api-tokens
                </a>
                에서 토큰을 만들어 붙여넣어 주세요. 키는 브라우저 localStorage에만
                저장돼요.
              </p>
              <input
                type="password"
                value={byokInput}
                onChange={(e) => setByokInput(e.target.value)}
                placeholder="r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="input input-bordered w-full font-mono text-sm"
                autoComplete="off"
              />
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={byokConsent}
                  onChange={(e) => setByokConsent(e.target.checked)}
                />
                <span className="label-text text-xs">
                  본인 토큰 사용 및 브라우저 보관에 동의합니다.
                </span>
              </label>
              {byokError && <p className="text-xs text-error">{byokError}</p>}
              <button
                type="button"
                onClick={saveByokInline}
                className="btn btn-primary btn-sm"
                disabled={!byokInput.trim() || !byokConsent}
              >
                토큰 저장
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 1. 입력 — 멀티 업로드 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title text-base">
              1. 32장 정적 이모티콘 입력
              <span className="badge badge-primary badge-sm ml-2">
                {filledCount} / {TOTAL_SLOTS}
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/generate" className="btn btn-ghost btn-xs">
                /generate에서 만들기
              </Link>
              {filledCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllInputs}
                  className="btn btn-ghost btn-xs"
                >
                  전체 초기화
                </button>
              )}
            </div>
          </div>

          <label
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-base-300 hover:border-primary/60"
            }`}
          >
            <p className="text-sm font-medium">
              여러 이미지를 한 번에 끌어다 놓거나, 클릭해서 선택
            </p>
            <p className="mt-1 text-xs text-base-content/60">
              PNG/JPG/WebP · 빈 슬롯에 순서대로 자동 배치됨
            </p>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </label>

          {/* 슬롯 미리보기 */}
          <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
            {inputs.map((s) => (
              <div
                key={s.slot}
                className={`relative flex aspect-square flex-col overflow-hidden rounded-lg border bg-base-100 ${
                  s.blob ? "border-success/40" : "border-base-300"
                }`}
                title={`${s.slot}. ${s.label}`}
              >
                <div className="relative flex flex-1 items-center justify-center bg-base-200">
                  {s.url ? (
                    <img
                      src={s.url}
                      alt={s.label}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] opacity-40">{s.slot}</span>
                  )}
                  {s.blob && (
                    <button
                      type="button"
                      onClick={() => removeSlot(s.slot)}
                      className="absolute right-0.5 top-0.5 btn btn-circle btn-ghost btn-xs bg-base-100/80"
                      aria-label={`슬롯 ${s.slot} 제거`}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="border-t border-base-300 px-1 py-0.5">
                  <span className="block truncate text-[9px] text-base-content/70">
                    {s.slot}.{s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. 옵션 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <h2 className="card-title text-base">2. 모델 / 프롬프트 / GIF 변환</h2>

          <div>
            <label className="label py-1">
              <span className="label-text text-sm">전역 모션 프롬프트 (영문 권장)</span>
            </label>
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="textarea textarea-bordered w-full font-mono text-xs"
              placeholder={DEFAULT_PROMPT}
            />
            <p className="mt-1 text-xs text-base-content/60">
              32장 모두에 동일하게 적용돼요. 슬롯별 감정은 정적 이미지 자체가 표현하므로
              여기선 “움직임의 결”만 묘사하는 게 깔끔.
            </p>
          </div>

          <div>
            <label className="label py-1">
              <span className="label-text text-sm">모델</span>
            </label>
            <div className="grid gap-2 md:grid-cols-2">
              {MODEL_OPTIONS.map((m) => {
                const total = estimateBatchCost(filledCount, m.key).usd;
                return (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${
                      model === m.key
                        ? "border-primary bg-primary/5"
                        : "border-base-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="batch-i2v-model"
                      className="radio radio-sm radio-primary mt-0.5"
                      checked={model === m.key}
                      onChange={() => setModel(m.key)}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {m.label}{" "}
                        <span className="text-xs text-base-content/60">
                          {m.perClip} / 클립
                        </span>
                      </p>
                      <p className="text-xs text-base-content/60">{m.desc}</p>
                      <p className="mt-0.5 text-[10px] text-base-content/50">
                        예상 총 비용 ({filledCount}장):{" "}
                        <strong>${total.toFixed(2)}</strong>
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={convertGif}
                onChange={(e) => setConvertGif(e.target.checked)}
              />
              <span className="label-text text-sm">
                MP4 → GIF 자동 변환 (카카오 360×360·24fps·1초)
              </span>
            </label>

            <div className="flex items-center gap-2">
              <label className="label-text text-sm">동시 처리</label>
              <select
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="select select-bordered select-sm"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
              <span className="text-xs text-base-content/60">
                기본 2 (Replicate rate limit 안전 범위)
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 비용 카드 */}
      <section className="card border border-warning/40 bg-warning/5">
        <div className="card-body space-y-1 p-4">
          <h3 className="text-sm font-bold">💰 예상 비용 ({filledCount}장 기준)</h3>
          <p className="text-xs">
            Wan 2.2 Fast: <strong>${estimateBatchCost(filledCount, "wan-fast").usd.toFixed(2)}</strong>
            {" · "}
            Kling: <strong>${estimateBatchCost(filledCount, "kling").usd.toFixed(2)}</strong>
            {" "}
            <span className="opacity-60">(클립당 $0.05 / $0.30, 본인 Replicate 청구서로 결제)</span>
          </p>
          <p className="text-xs text-base-content/60">
            현재 선택: <strong>{model === "wan-fast" ? "Wan 2.2 Fast" : "Kling v2.0"}</strong> →{" "}
            예상 ${cost.usd.toFixed(2)}
          </p>
        </div>
      </section>

      {/* 실행 / 취소 */}
      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={!canStart}
          className="btn btn-primary"
        >
          🚀 32장 일괄 애니메이션 시작
        </button>
        {runStatus === "running" && (
          <button type="button" onClick={cancel} className="btn btn-error btn-sm">
            ⏹ 중지
          </button>
        )}
        {!byokView.hasKey && (
          <span className="text-xs text-warning">
            먼저 Replicate 토큰을 등록해 주세요.
          </span>
        )}
        {filledCount === 0 && byokView.hasKey && (
          <span className="text-xs text-base-content/60">
            이미지를 한 장 이상 업로드해 주세요.
          </span>
        )}
      </section>

      {errorMsg && (
        <div className="alert alert-error text-sm">{errorMsg}</div>
      )}

      {/* 진행률 + 결과 그리드 */}
      {(runStatus !== "idle" || results.length > 0) && (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="card-title text-base">
                {runStatus === "running"
                  ? "진행 중..."
                  : runStatus === "succeeded"
                    ? "✅ 완료"
                    : runStatus === "canceled"
                      ? "⏹ 취소됨"
                      : runStatus === "failed"
                        ? "⚠ 일부 실패"
                        : "결과"}
              </h2>
              <span className="badge badge-primary">
                {doneCount} / {filledCount}
              </span>
            </div>
            <progress
              className="progress progress-primary w-full"
              value={totalProgress}
              max={100}
            />
            {results.length > 0 && (
              <BatchAnimateGrid results={results} preview={convertGif ? "gif" : "mp4"} />
            )}
          </div>
        </section>
      )}

      {/* 다운로드 */}
      {runStatus === "succeeded" || (results.length > 0 && successCount > 0 && runStatus !== "running") ? (
        <section className="card border border-success/40 bg-success/5">
          <div className="card-body space-y-2">
            <h3 className="card-title text-success text-base">
              🎉 {successCount}장 일괄 변환 성공
            </h3>
            <p className="text-sm">
              ZIP으로 일괄 다운로드 후 카카오 이모티콘 스튜디오에 그대로 업로드하세요.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadZip("all")}
                className="btn btn-primary btn-sm"
              >
                ⬇ 전체 ZIP (MP4 + GIF)
              </button>
              <button
                type="button"
                onClick={() => downloadZip("gif")}
                className="btn btn-outline btn-sm"
              >
                🎁 GIF만 (카카오용)
              </button>
              <button
                type="button"
                onClick={() => downloadZip("mp4")}
                className="btn btn-outline btn-sm"
              >
                🎞 MP4만
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* 카카오 사양 안내 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-2">
          <h2 className="card-title text-base">📋 카카오 움직이는 이모티콘 사양</h2>
          <ul className="ml-4 list-disc space-y-1 text-sm text-base-content/70">
            <li>해상도: <strong>360 × 360 px</strong></li>
            <li>프레임 수: <strong>24프레임 이하</strong> (24fps × 1초)</li>
            <li>형식: <strong>GIF</strong> (투명 배경 권장)</li>
            <li>제출 단위: <strong>32장 묶음</strong> (이 페이지의 단위)</li>
          </ul>
          <p className="text-xs text-base-content/60">
            ZIP 안의 GIF는 모두 위 규격에 맞춰 ffmpeg.wasm으로 즉시 변환된 결과예요.
            서버 비용 0, 모든 변환은 사용자 브라우저에서만 처리.
          </p>
          <p className="text-xs">
            <Link href="/animate" className="link link-primary">
              단일 이미지 흐름
            </Link>
            {" · "}
            <Link href="/generate" className="link link-primary">
              정적 32장 생성기
            </Link>
            {" · "}
            <Link href="/tools/resize" className="link link-primary">
              사이즈 변환기
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
