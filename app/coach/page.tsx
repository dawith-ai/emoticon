"use client";

/**
 * 카카오 합격 코치 (Coach) — 사전 감사 + 거절 회복 통합 페이지.
 *
 * 두 탭:
 *  A. 사전 감사: 시드 1장 + 32장 → 합격 확률 + 차원별 점수 + 약점 슬롯 자동 수정안
 *  B. 거절 회복: 거절 사유 + 거절된 32장 → 슬롯별 재생성 프롬프트 + 추정 합격 확률
 *
 * 카카오 사양 spec 자동 동시 검사. ZIP 다운로드는 신청 폴더 구조로 즉시 제출 가능.
 *
 * BYOK Gemini 키만 필요 — 모든 호출은 사용자 브라우저에서, 서버 비용 0.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EMOTIONS_32, type EmotionDef } from "@/lib/emotions";
import { getActiveByokKey } from "@/lib/byok";
import {
  auditSet,
  KakaoCriticError,
  recoveryPrompt,
  DIMENSIONS,
  DIMENSION_LABEL_KO,
  type Dimension,
  type SetAudit,
  type SlotAudit,
} from "@/lib/ai/kakao-critic";
import {
  buildSubmissionZip,
  validateSet,
  type SetSpecItem,
} from "@/lib/ai/kakao-spec";
import {
  classifyOffline,
  parseRejectEmail,
  RejectParserError,
  type RejectClassification,
} from "@/lib/ai/reject-parser";

const SESSION_KEY = "vibemoji.batch.frames";
const TOTAL_SLOTS = EMOTIONS_32.length;
const DEFAULT_CONCURRENCY = 3;

type Tab = "audit" | "recovery";

type RunStatus = "idle" | "running" | "succeeded" | "failed" | "canceled";

interface SeedInput {
  blob: Blob | null;
  url: string | null;
}

interface SlotInput {
  slot: number;
  label: string;
  blob: Blob | null;
  url: string | null;
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

function probColor(p: number): string {
  if (p >= 0.6) return "text-success";
  if (p >= 0.35) return "text-warning";
  return "text-error";
}

function scoreColor(score: number): string {
  if (score >= 7) return "text-success";
  if (score >= 5) return "text-warning";
  return "text-error";
}

function scoreBgClass(score: number): string {
  if (score >= 7) return "bg-success/15 border-success/40";
  if (score >= 5) return "bg-warning/15 border-warning/40";
  return "bg-error/15 border-error/40";
}

export default function CoachPage() {
  const [tab, setTab] = useState<Tab>("audit");

  // 시드
  const [seed, setSeed] = useState<SeedInput>({ blob: null, url: null });

  // 32장
  const [inputs, setInputs] = useState<SlotInput[]>(makeEmptyInputs);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  // 거절 사유 (Tab B)
  const [kakaoFeedback, setKakaoFeedback] = useState<string>("");
  const [rejectClass, setRejectClass] = useState<RejectClassification | null>(null);
  const [rejectClassifyBusy, setRejectClassifyBusy] = useState<false | "online" | "offline">(false);
  const [rejectClassifyError, setRejectClassifyError] = useState<string | null>(null);

  const onClassifyReject = (mode: "online" | "offline") => {
    setRejectClassifyError(null);
    if (!kakaoFeedback.trim()) {
      setRejectClassifyError("거절 사유 텍스트를 먼저 입력해주세요.");
      return;
    }
    if (mode === "offline") {
      setRejectClass(classifyOffline(kakaoFeedback));
      return;
    }
    setRejectClassifyBusy("online");
    parseRejectEmail(kakaoFeedback)
      .then((res) => setRejectClass(res))
      .catch((err: unknown) => {
        if (err instanceof RejectParserError) {
          setRejectClassifyError(err.message);
        } else {
          setRejectClassifyError(
            err instanceof Error ? err.message : "분류 실패",
          );
        }
        // Gemini 실패 시 오프라인 폴백
        setRejectClass(classifyOffline(kakaoFeedback));
      })
      .finally(() => setRejectClassifyBusy(false));
  };

  // 실행 상태
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [audit, setAudit] = useState<SetAudit | null>(null);
  const [specReports, setSpecReports] = useState<SetSpecItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState<number>(DEFAULT_CONCURRENCY);

  const abortRef = useRef<AbortController | null>(null);
  const dragCounterRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  // 모달 상세
  const [openSlot, setOpenSlot] = useState<number | null>(null);

  useEffect(() => {
    setHasKey(!!getActiveByokKey());
  }, []);

  // /generate 핸드오프
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "generate") return;

    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;
    const frames = parsed.filter(isSessionFrame);
    if (frames.length === 0) return;

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
          // ignore
        }
      }
      setInputs(next);
      setHandoffNote(`/generate에서 ${loaded}/${TOTAL_SLOTS}장 자동 로드 완료`);
    })();
  }, []);

  // objectURL 정리
  useEffect(() => {
    return () => {
      if (seed.url) URL.revokeObjectURL(seed.url);
      inputs.forEach((s) => {
        if (s.url) URL.revokeObjectURL(s.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filledCount = useMemo(
    () => inputs.filter((s) => s.blob !== null).length,
    [inputs],
  );

  const canStart = useMemo(() => {
    if (!hasKey) return false;
    if (!seed.blob) return false;
    if (filledCount === 0) return false;
    if (runStatus === "running") return false;
    return true;
  }, [hasKey, seed.blob, filledCount, runStatus]);

  // ─── 시드 입력 ─────────────────────────────────────────────

  const onSeedChange = (file: File | null) => {
    if (seed.url) URL.revokeObjectURL(seed.url);
    if (!file) {
      setSeed({ blob: null, url: null });
      return;
    }
    const url = URL.createObjectURL(file);
    setSeed({ blob: file, url });
  };

  // ─── 32장 입력 ─────────────────────────────────────────────

  const assignFiles = (files: ReadonlyArray<File>) => {
    if (files.length === 0) return;
    setInputs((prev) => {
      const next = prev.map((s) => ({ ...s }));
      let cursor = 0;
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
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

  const clearAll = () => {
    abortRef.current?.abort();
    setInputs((prev) => {
      prev.forEach((s) => {
        if (s.url) URL.revokeObjectURL(s.url);
      });
      return makeEmptyInputs();
    });
    setAudit(null);
    setSpecReports([]);
    setProgress({ done: 0, total: 0 });
    setRunStatus("idle");
    setErrorMsg(null);
  };

  // ─── 실행 ───────────────────────────────────────────────────

  const start = async () => {
    if (!seed.blob) {
      setErrorMsg("시드 이미지(참고 캐릭터 1장)를 먼저 업로드해 주세요.");
      return;
    }
    setErrorMsg(null);
    setAudit(null);
    setSpecReports([]);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const frames = inputs
      .filter((s): s is SlotInput & { blob: Blob } => s.blob !== null)
      .map((s) => ({ slot: s.slot, blob: s.blob }));

    if (frames.length === 0) {
      setErrorMsg("감사할 이미지가 없어요. 먼저 32장을 업로드해 주세요.");
      return;
    }

    setRunStatus("running");
    setProgress({ done: 0, total: frames.length });

    try {
      // 사양 검증과 Gemini 감사 동시 진행
      const specPromise = validateSet(
        frames.map((f) => ({ slot: f.slot, static: f.blob })),
      );

      const auditResult = await auditSet(seed.blob, frames, {
        concurrency,
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      const specs = await specPromise;

      setAudit(auditResult);
      setSpecReports(specs);

      // /feedback 흐름으로 핸드오프 (옵트인 결과 수집)
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(
            "vibemoji.coach.lastAudit",
            JSON.stringify({
              setOverall: auditResult.setOverall,
              approvalProb: auditResult.setApprovalProb,
              weakestSlots: auditResult.weakestSlots,
              auditedAt: Date.now(),
            }),
          );
        } catch {
          // sessionStorage quota — 무시
        }
      }

      if (ctrl.signal.aborted) {
        setRunStatus("canceled");
      } else {
        setRunStatus("succeeded");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof KakaoCriticError
          ? err.message
          : err instanceof Error
            ? err.message
            : "알 수 없는 오류";
      setErrorMsg(msg);
      setRunStatus(ctrl.signal.aborted ? "canceled" : "failed");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  // ─── ZIP 다운로드 ──────────────────────────────────────────

  const downloadSubmissionZip = async () => {
    const items = inputs
      .filter((s): s is SlotInput & { blob: Blob } => s.blob !== null)
      .map((s) => ({ slot: s.slot, static: s.blob }));
    if (items.length === 0) return;
    try {
      const blob = await buildSubmissionZip(items, {
        title: "VibeMoji Coach 제출",
        description: "카카오 이모티콘 사전 감사 통과본",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vibemoji_kakao_submission.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ZIP 생성 실패";
      setErrorMsg(msg);
    }
  };

  // ─── 파생 통계 ─────────────────────────────────────────────

  const dimAverages = useMemo<Record<Dimension, number> | null>(() => {
    if (!audit || audit.perSlot.length === 0) return null;
    const sums: Record<Dimension, number> = {
      line: 0,
      color: 0,
      background: 0,
      expression: 0,
      consistency: 0,
      copyright: 0,
    };
    for (const slot of audit.perSlot) {
      for (const d of DIMENSIONS) sums[d] += slot.scores[d];
    }
    const n = audit.perSlot.length;
    return {
      line: sums.line / n,
      color: sums.color / n,
      background: sums.background / n,
      expression: sums.expression / n,
      consistency: sums.consistency / n,
      copyright: sums.copyright / n,
    };
  }, [audit]);

  const slotById = useMemo(() => {
    const map = new Map<number, SlotAudit>();
    if (audit) for (const s of audit.perSlot) map.set(s.slot, s);
    return map;
  }, [audit]);

  const specBySlot = useMemo(() => {
    const map = new Map<number, SetSpecItem>();
    for (const s of specReports) map.set(s.slot, s);
    return map;
  }, [specReports]);

  const detailSlot = openSlot != null ? slotById.get(openSlot) ?? null : null;
  const detailSpec = openSlot != null ? specBySlot.get(openSlot) ?? null : null;

  const totalProgress =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  // ─── 약점 슬롯 일괄 자동 수정 (프롬프트 표시) ──────────

  const [bulkFixOpen, setBulkFixOpen] = useState(false);
  const bulkFixPrompts = useMemo(() => {
    if (!audit) return [];
    const weakSet = new Set(audit.weakestSlots);
    return audit.perSlot
      .filter((s) => weakSet.has(s.slot))
      .map((s) => ({
        slot: s.slot,
        prompt: recoveryPrompt(
          s,
          tab === "recovery" ? kakaoFeedback : undefined,
        ),
      }));
  }, [audit, kakaoFeedback, tab]);

  // ─── 거절 회복 탭: 슬롯별 프롬프트 ──────────────────────

  const recoveryPrompts = useMemo(() => {
    if (!audit) return [];
    return audit.perSlot.map((s) => ({
      slot: s.slot,
      label: EMOTIONS_32.find((e) => e.slot === s.slot)?.label ?? `슬롯 ${s.slot}`,
      before: s.approvalProbability,
      // 휴리스틱: 약점 차원 평균 +2점 가정 → 재계산
      afterEstimate: estimateAfter(s),
      prompt: recoveryPrompt(s, kakaoFeedback),
    }));
  }, [audit, kakaoFeedback]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">카카오 합격 코치</h1>
          <span className="badge badge-secondary">Beta</span>
          <span className="badge badge-primary badge-outline">
            거절율 95% 시장 대응
          </span>
        </div>
        <p className="text-sm text-base-content/70">
          제출 전에 합격 확률을 예측하고, 약점 슬롯의 수정안을 자동으로 제시해요.
          이미 거절됐다면 거절 사유를 입력해 회복 프롬프트를 받으세요.
        </p>
      </header>

      {handoffNote && (
        <div className="alert alert-success text-sm">{handoffNote}</div>
      )}

      {/* BYOK 안내 */}
      {!hasKey && (
        <div className="alert alert-warning text-sm">
          <span>
            Gemini BYOK 키가 필요해요.{" "}
            <Link href="/settings" className="link link-primary">
              /settings
            </Link>
            에서 키를 등록해 주세요. (브라우저 localStorage에만 저장)
          </span>
        </div>
      )}

      {/* 탭 */}
      <div className="tabs tabs-boxed w-fit">
        <button
          type="button"
          className={`tab ${tab === "audit" ? "tab-active" : ""}`}
          onClick={() => setTab("audit")}
        >
          A. 사전 감사
        </button>
        <button
          type="button"
          className={`tab ${tab === "recovery" ? "tab-active" : ""}`}
          onClick={() => setTab("recovery")}
        >
          B. 거절 회복
        </button>
      </div>

      {/* 시드 + 32장 입력 (공통) */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <h2 className="card-title text-base">
            1. 시드 캐릭터 (참고 1장)
          </h2>
          <div className="flex flex-wrap items-start gap-4">
            <label className="flex w-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-base-300 p-2 hover:border-primary/60">
              {seed.url ? (
                <img
                  src={seed.url}
                  alt="업로드한 시드 캐릭터 이미지"
                  className="h-32 w-32 object-contain"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center text-xs text-base-content/50">
                  시드 업로드
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onSeedChange(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex-1 text-sm text-base-content/70">
              감사 모델이 “이 캐릭터와 같은가”를 비교 기준으로 사용해요.
              가장 표준적인 정면 1장을 권장.
              {seed.blob && (
                <button
                  type="button"
                  onClick={() => onSeedChange(null)}
                  className="btn btn-ghost btn-xs ml-2"
                >
                  제거
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title text-base">
              2. {tab === "audit" ? "감사할 32장" : "거절된 32장"}
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
                  onClick={clearAll}
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
              여러 이미지를 끌어다 놓거나 클릭해서 선택
            </p>
            <p className="mt-1 text-xs text-base-content/60">
              PNG/JPG/WebP · 빈 슬롯에 순서대로 자동 배치
            </p>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </label>

          <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
            {inputs.map((s) => {
              const slotAudit = slotById.get(s.slot);
              const cls = slotAudit
                ? scoreBgClass(slotAudit.overall)
                : s.blob
                  ? "border-success/40"
                  : "border-base-300";
              return (
                <button
                  type="button"
                  key={s.slot}
                  onClick={() => slotAudit && setOpenSlot(s.slot)}
                  className={`relative flex aspect-square flex-col overflow-hidden rounded-lg border bg-base-100 ${cls} ${
                    slotAudit ? "cursor-pointer hover:ring-2 hover:ring-primary/40" : ""
                  }`}
                  title={`${s.slot}. ${s.label}`}
                  disabled={!slotAudit}
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
                    {s.blob && !slotAudit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSlot(s.slot);
                        }}
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
                      {slotAudit && (
                        <span
                          className={`ml-1 font-bold ${scoreColor(slotAudit.overall)}`}
                        >
                          {slotAudit.overall.toFixed(1)}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tab B: 거절 사유 입력 */}
      {tab === "recovery" && (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-2">
            <h2 className="card-title text-base">3. 카카오 거절 사유 (선택)</h2>
            <textarea
              rows={3}
              value={kakaoFeedback}
              onChange={(e) => setKakaoFeedback(e.target.value)}
              placeholder="예: 캐릭터 일관성이 부족합니다. 외곽선 두께가 일정하지 않습니다."
              className="textarea textarea-bordered w-full text-sm"
            />
            <p className="text-xs text-base-content/60">
              비워두어도 동작해요. 입력 시 회복 프롬프트가 카카오 메시지에 맞춰
              조정됩니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onClassifyReject("online")}
                disabled={!!rejectClassifyBusy || !kakaoFeedback.trim()}
                className="btn btn-primary btn-sm"
              >
                {rejectClassifyBusy === "online" ? "분석 중..." : "🤖 차원 자동 분류 (Gemini)"}
              </button>
              <button
                type="button"
                onClick={() => onClassifyReject("offline")}
                disabled={!kakaoFeedback.trim()}
                className="btn btn-ghost btn-sm"
              >
                키워드 분류 (오프라인)
              </button>
              {rejectClass && (
                <button
                  type="button"
                  onClick={() => setRejectClass(null)}
                  className="btn btn-ghost btn-sm"
                >
                  결과 지우기
                </button>
              )}
            </div>
            {rejectClassifyError && (
              <div className="alert alert-error text-xs">
                <span>{rejectClassifyError}</span>
              </div>
            )}
            {rejectClass && (
              <div className="rounded border border-base-300 bg-base-200/50 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold">차원별 신뢰도:</span>
                  {DIMENSIONS.map((d) => {
                    const score = rejectClass.dimensions[d];
                    const pct = Math.round(score * 100);
                    return (
                      <span
                        key={d}
                        className={`badge badge-sm ${
                          d === rejectClass.primary
                            ? "badge-error"
                            : rejectClass.secondary.includes(d)
                              ? "badge-warning"
                              : "badge-ghost"
                        }`}
                        title={`${DIMENSION_LABEL_KO[d]} ${pct}%`}
                      >
                        {DIMENSION_LABEL_KO[d]} {pct}%
                      </span>
                    );
                  })}
                </div>
                <p className="text-xs text-base-content/80">
                  <strong>요약:</strong> {rejectClass.summary}
                </p>
                {rejectClass.actionableLines.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-base-content/70 space-y-0.5">
                    {rejectClass.actionableLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-base-content/50">
                  ⚙️ 우선 수정 차원이 회복 프롬프트에 자동 반영됩니다.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 옵션 + 실행 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <div className="flex flex-wrap items-center gap-3">
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
              Gemini 무료 티어 안전: 기본 3
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={start}
              disabled={!canStart}
              className="btn btn-primary"
            >
              {tab === "audit"
                ? "카카오 합격 감사 시작"
                : "거절 사유 분석 + 자동 수정안 생성"}
            </button>
            {runStatus === "running" && (
              <button
                type="button"
                onClick={cancel}
                className="btn btn-error btn-sm"
              >
                중지
              </button>
            )}
            {!hasKey && (
              <span className="text-xs text-warning">
                먼저 Gemini 키를 등록해 주세요.
              </span>
            )}
            {!seed.blob && hasKey && (
              <span className="text-xs text-base-content/60">
                시드 1장이 필요해요.
              </span>
            )}
          </div>
        </div>
      </section>

      {errorMsg && <div className="alert alert-error text-sm">{errorMsg}</div>}

      {/* 진행률 */}
      {runStatus !== "idle" && (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="card-title text-base">
                {runStatus === "running"
                  ? "감사 진행 중..."
                  : runStatus === "succeeded"
                    ? "감사 완료"
                    : runStatus === "canceled"
                      ? "취소됨"
                      : "실패"}
              </h2>
              <span className="badge badge-primary">
                {progress.done} / {progress.total}
              </span>
            </div>
            <progress
              className="progress progress-primary w-full"
              value={totalProgress}
              max={100}
            />
          </div>
        </section>
      )}

      {/* 결과 대시보드 */}
      {audit && (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="card-title text-base">전체 합격 확률</h2>
                <p
                  className={`text-4xl font-bold ${probColor(
                    audit.setApprovalProb,
                  )}`}
                >
                  {Math.round(audit.setApprovalProb * 100)}%
                </p>
                <p className="text-xs text-base-content/60">
                  종합 점수 {audit.setOverall.toFixed(2)} / 10
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBulkFixOpen((v) => !v)}
                  className="btn btn-secondary btn-sm"
                  disabled={audit.weakestSlots.length === 0}
                >
                  약점 슬롯 일괄 자동 수정 ({audit.weakestSlots.length})
                </button>
                <button
                  type="button"
                  onClick={downloadSubmissionZip}
                  className="btn btn-outline btn-sm"
                >
                  신청용 ZIP 다운로드
                </button>
                <Link href="/feedback" className="btn btn-warning btn-sm">
                  📊 제출 후 결과 기록 →
                </Link>
              </div>
            </div>

            {/* 차원별 평균 막대 */}
            {dimAverages && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">차원별 평균</h3>
                <div className="space-y-1">
                  {DIMENSIONS.map((d) => {
                    const v = dimAverages[d];
                    const pct = (v / 10) * 100;
                    return (
                      <div key={d} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0">
                          {DIMENSION_LABEL_KO[d]}
                        </span>
                        <div className="relative h-3 flex-1 overflow-hidden rounded bg-base-200">
                          <div
                            className={`h-full ${
                              v >= 7
                                ? "bg-success"
                                : v >= 5
                                  ? "bg-warning"
                                  : "bg-error"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className={`w-10 text-right font-mono ${scoreColor(v)}`}
                        >
                          {v.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 세트 단위 이슈 */}
            {audit.setLevelIssues.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">
                  32장 묶음 단위 이슈
                </h3>
                <ul className="ml-4 list-disc space-y-1 text-xs text-base-content/80">
                  {audit.setLevelIssues.map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 약점 슬롯 일괄 수정안 패널 */}
            {bulkFixOpen && (
              <div className="rounded-lg border border-secondary/40 bg-secondary/5 p-3">
                <h3 className="mb-2 text-sm font-semibold">
                  약점 슬롯 자동 수정안 (재생성용 영문 프롬프트)
                </h3>
                <p className="mb-2 text-xs text-base-content/60">
                  복사해서 /generate 또는 /lora의 프롬프트로 사용. LoRA가 활성일
                  때만 즉시 재생성, 아니면 프롬프트만 표시.
                </p>
                <div className="space-y-2">
                  {bulkFixPrompts.map((p) => (
                    <details
                      key={p.slot}
                      className="rounded border border-base-300 bg-base-100 p-2"
                    >
                      <summary className="cursor-pointer text-sm">
                        슬롯 {p.slot}
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] text-base-content/80">
                        {p.prompt}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 사양 검증 결과 */}
      {specReports.length > 0 && (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-2">
            <h2 className="card-title text-base">카카오 사양 자동 검증</h2>
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>슬롯</th>
                    <th>파일 형식</th>
                    <th>크기 (360×360)</th>
                    <th>용량 (&lt;150KB)</th>
                    <th>투명도</th>
                  </tr>
                </thead>
                <tbody>
                  {specReports.map((r) => (
                    <tr key={r.slot}>
                      <td>{r.slot}</td>
                      <td className={r.static.fileType.ok ? "text-success" : "text-error"}>
                        {r.static.fileType.ok ? "OK" : r.static.fileType.reason}
                      </td>
                      <td className={r.static.dimensions.ok ? "text-success" : "text-error"}>
                        {r.static.dimensions.ok ? "OK" : r.static.dimensions.reason}
                      </td>
                      <td className={r.static.fileSize.ok ? "text-success" : "text-error"}>
                        {r.static.fileSize.ok ? "OK" : r.static.fileSize.reason}
                      </td>
                      <td className={r.static.transparency.ok ? "text-success" : "text-error"}>
                        {r.static.transparency.ok
                          ? "OK"
                          : r.static.transparency.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Tab B: 슬롯별 회복 프롬프트 + 추정 합격 확률 변화 */}
      {tab === "recovery" && audit && recoveryPrompts.length > 0 && (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-2">
            <h2 className="card-title text-base">
              슬롯별 회복 프롬프트 + 추정 합격 확률 변화
            </h2>
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>슬롯</th>
                    <th>라벨</th>
                    <th>현재</th>
                    <th>수정 후 (추정)</th>
                    <th>프롬프트</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveryPrompts.map((p) => (
                    <tr key={p.slot}>
                      <td>{p.slot}</td>
                      <td>{p.label}</td>
                      <td className={probColor(p.before)}>
                        {Math.round(p.before * 100)}%
                      </td>
                      <td className={probColor(p.afterEstimate)}>
                        {Math.round(p.afterEstimate * 100)}%
                      </td>
                      <td>
                        <details>
                          <summary className="cursor-pointer">보기</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[10px]">
                            {p.prompt}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 슬롯 상세 모달 */}
      {detailSlot && (
        <div
          className="modal modal-open"
          onClick={() => setOpenSlot(null)}
          role="dialog"
        >
          <div
            className="modal-box max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">
              슬롯 {detailSlot.slot} 감사 결과
            </h3>
            <p
              className={`mt-1 text-sm ${probColor(detailSlot.approvalProbability)}`}
            >
              합격 확률 {Math.round(detailSlot.approvalProbability * 100)}% ·
              종합 {detailSlot.overall.toFixed(2)}/10
            </p>

            <div className="mt-3 space-y-1">
              {DIMENSIONS.map((d) => (
                <div key={d} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0">
                    {DIMENSION_LABEL_KO[d]}
                  </span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded bg-base-200">
                    <div
                      className={`h-full ${
                        detailSlot.scores[d] >= 7
                          ? "bg-success"
                          : detailSlot.scores[d] >= 5
                            ? "bg-warning"
                            : "bg-error"
                      }`}
                      style={{ width: `${(detailSlot.scores[d] / 10) * 100}%` }}
                    />
                  </div>
                  <span
                    className={`w-10 text-right font-mono ${scoreColor(detailSlot.scores[d])}`}
                  >
                    {detailSlot.scores[d]}
                  </span>
                </div>
              ))}
            </div>

            {detailSlot.topRisks.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold">Top 위험</h4>
                <ul className="ml-4 list-disc text-xs text-base-content/80">
                  {detailSlot.topRisks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {detailSlot.suggestedFixes.length > 0 && (
              <div className="mt-2">
                <h4 className="text-sm font-semibold">수정안</h4>
                <ul className="ml-4 list-disc text-xs text-base-content/80">
                  {detailSlot.suggestedFixes.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {detailSpec && (
              <div className="mt-3 rounded border border-base-300 bg-base-200 p-2 text-xs">
                <strong>사양 검증</strong>
                <ul className="ml-4 list-disc">
                  {!detailSpec.static.fileType.ok && (
                    <li>형식: {detailSpec.static.fileType.reason}</li>
                  )}
                  {!detailSpec.static.dimensions.ok && (
                    <li>크기: {detailSpec.static.dimensions.reason}</li>
                  )}
                  {!detailSpec.static.fileSize.ok && (
                    <li>용량: {detailSpec.static.fileSize.reason}</li>
                  )}
                  {!detailSpec.static.transparency.ok && (
                    <li>투명도: {detailSpec.static.transparency.reason}</li>
                  )}
                  {detailSpec.static.fileType.ok &&
                    detailSpec.static.dimensions.ok &&
                    detailSpec.static.fileSize.ok &&
                    detailSpec.static.transparency.ok && <li>모두 통과</li>}
                </ul>
              </div>
            )}

            <div className="mt-3">
              <h4 className="text-sm font-semibold">재생성 프롬프트</h4>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-base-200 p-2 text-[10px]">
                {recoveryPrompt(
                  detailSlot,
                  tab === "recovery" ? kakaoFeedback : undefined,
                )}
              </pre>
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setOpenSlot(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 안내 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-2">
          <h2 className="card-title text-base">참고</h2>
          <ul className="ml-4 list-disc space-y-1 text-xs text-base-content/70">
            <li>
              감사 결과는 Gemini 2.5 Flash 휴리스틱이며, 실제 카카오 심사와 100%
              일치하지는 않아요. 합격 확률은 가이드 지표.
            </li>
            <li>
              저작권 평가는 한국 시장 IP 유사성을 완벽히 알 수 없는 영역 — 점수
              0-3은 “위험 신호”로만 사용하고 인간 검토를 병행하세요.
            </li>
            <li>
              32장 모두 평가 시 무료 티어 분당 한도 영향 — 동시성 3 기준 약 3-4
              분 소요.
            </li>
          </ul>
          <p className="text-xs">
            <Link href="/generate" className="link link-primary">
              정적 32장 생성기
            </Link>
            {" · "}
            <Link href="/animate-batch" className="link link-primary">
              일괄 애니메이션
            </Link>
            {" · "}
            <Link href="/judge" className="link link-primary">
              일관성 감사
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * 회복 프롬프트 적용 후 합격 확률 추정:
 * 약점 차원(<6점)에 +2점 가정 후 재계산.
 */
function estimateAfter(slot: SlotAudit): number {
  const adjusted = { ...slot.scores };
  for (const d of DIMENSIONS) {
    if (adjusted[d] < 6) adjusted[d] = Math.min(10, adjusted[d] + 2);
  }
  const overall =
    0.3 * adjusted.consistency +
    0.2 * adjusted.line +
    0.15 * adjusted.expression +
    0.15 * adjusted.background +
    0.1 * adjusted.color +
    0.1 * adjusted.copyright;
  let p = overall / 10;
  if (adjusted.copyright < 5) p *= 0.3;
  if (adjusted.consistency < 6) p *= 0.5;
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  return Math.round(p * 1000) / 1000;
}
