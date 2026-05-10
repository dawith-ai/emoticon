/**
 * 32장 일괄 I2V (Batch Image-to-Video) 헬퍼 — VibeMoji의 핵심 차별점.
 *
 * 카카오 "움직이는 이모티콘"은 정확히 32장 GIF 묶음 단위로 제출되므로,
 * 정적 32장 → 32 MP4 → 32 GIF를 한 번에 자동화한다.
 *
 * 이 모듈은 React에 의존하지 않는 순수 모듈이며, 다음 두 함수를 export 한다:
 *   - batchAnimate: 정적 32장(BatchItem[])을 순차/제한된 동시성으로 I2V 처리
 *   - downloadBatchAsZip: 결과(BatchResult[])를 단일 ZIP 으로 묶기
 *
 * 동시성 기본값 = 2:
 *   - Replicate predictions API는 사용자 단위 rate limit이 있고, Wan/Kling
 *     큐는 이미 자체 백프레셔가 있으므로 너무 높이면 408/429 위험.
 *   - 동시 2개면 평균 처리시간(클립당 60-120초) 기준 32장 ≈ 16~32분.
 */

import { downloadAsBlob, pollAnimationStatus, startAnimation } from "@/lib/ai/i2v";
import type { AnimateModel, AnimateProgress } from "@/lib/ai/i2v";

export interface BatchItem {
  /** 1-based 슬롯 번호 (EMOTIONS_32와 매칭) */
  slot: number;
  /** UI 라벨 — 파일명/표시용 */
  label: string;
  /** 정적 이미지 (PNG/JPG/WebP). startAnimation에 그대로 투입 */
  image: Blob;
}

export type BatchSlotStatus =
  | "pending"
  | "starting"
  | "processing"
  | "converting"
  | "succeeded"
  | "failed"
  | "canceled";

export interface BatchResult {
  slot: number;
  label: string;
  /** Replicate predictionId. 시작 전이면 null */
  predictionId: string | null;
  status: BatchSlotStatus;
  /** I2V 진행률 (0~1). Replicate가 보고 안 하면 null */
  progress: number | null;
  /** 폴링 중 마지막 attempt 횟수 */
  attempt: number;
  /** 성공 시 MP4 Blob */
  mp4: Blob | null;
  /** convertGif=true 시 성공한 GIF Blob */
  gif: Blob | null;
  /** GIF 변환 진행률 (0~1) */
  gifProgress: number | null;
  /** 슬롯별 에러 메시지 — 다른 슬롯에 영향 X */
  error?: string;
}

export interface BatchAnimateOptions {
  /** 모델 선택 (기본 'wan-fast' — 비용/속도 우선) */
  model?: AnimateModel;
  /** 모든 슬롯에 동일하게 적용할 모션 프롬프트 */
  prompt?: string;
  /** 동시 진행 슬롯 수. 기본 2. (1~6 권장) */
  concurrency?: number;
  /** true면 각 MP4 완료 시 카카오 규격 GIF로 변환 */
  convertGif?: boolean;
  /** GIF 가로 px (카카오 360) */
  gifWidth?: number;
  /** GIF 세로 px (카카오 360) */
  gifHeight?: number;
  /** GIF fps (카카오 24) */
  gifFps?: number;
  /** GIF 길이 초 (카카오 1초) */
  gifDuration?: number;
  /** 진행 콜백 — 슬롯 완료/실패/상태 갱신마다 호출 */
  onProgress?: (
    done: number,
    total: number,
    current?: BatchResult,
  ) => void;
  /** 외부 abort 신호 — 즉시 진행 중인 슬롯 정리 */
  signal?: AbortSignal;
}

const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 6;
const MIN_CONCURRENCY = 1;

function clampConcurrency(n: number | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_CONCURRENCY;
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, v));
}

function makeInitialResult(item: BatchItem): BatchResult {
  return {
    slot: item.slot,
    label: item.label,
    predictionId: null,
    status: "pending",
    progress: null,
    attempt: 0,
    mp4: null,
    gif: null,
    gifProgress: null,
  };
}

/**
 * 한 슬롯에 대한 전체 파이프라인:
 *   startAnimation → pollAnimationStatus → downloadAsBlob → (옵션) convertMp4ToGif
 *
 * 슬롯별 try/catch로 감싸 다른 슬롯이 계속 진행되도록 보장한다.
 */
async function processOneSlot(
  item: BatchItem,
  state: BatchResult,
  opts: BatchAnimateOptions,
  emit: (r: BatchResult) => void,
): Promise<void> {
  const signal = opts.signal;
  const updateState = (patch: Partial<BatchResult>) => {
    Object.assign(state, patch);
    emit({ ...state });
  };

  if (signal?.aborted) {
    updateState({ status: "canceled", error: "사용자가 취소했어요" });
    return;
  }

  try {
    updateState({ status: "starting" });
    const id = await startAnimation(item.image, {
      prompt: opts.prompt?.trim() || undefined,
      model: opts.model ?? "wan-fast",
    });
    updateState({ predictionId: id, status: "processing" });

    const videoUrl = await pollAnimationStatus(
      id,
      (p: AnimateProgress) => {
        updateState({ progress: p.progress, attempt: p.attempt });
      },
      { signal },
    );

    if (signal?.aborted) {
      updateState({ status: "canceled", error: "사용자가 취소했어요" });
      return;
    }

    const mp4 = await downloadAsBlob(videoUrl);
    updateState({ mp4, status: opts.convertGif ? "converting" : "succeeded" });

    if (opts.convertGif) {
      // 동적 import — SSR 시 wasm 로드 방지. 첫 슬롯에서만 ~30MB 받고
      // 같은 페이지 세션 내 두 번째 슬롯부터는 즉시 변환됨.
      const { convertMp4ToGif } = await import("@/lib/ai/gif-convert");
      const gif = await convertMp4ToGif(mp4, {
        width: opts.gifWidth ?? 360,
        height: opts.gifHeight ?? 360,
        fps: opts.gifFps ?? 24,
        duration: opts.gifDuration ?? 1,
        signal,
        onProgress: (r: number) => {
          updateState({ gifProgress: r });
        },
      });
      updateState({ gif, gifProgress: 1, status: "succeeded" });
    }
  } catch (err: unknown) {
    const aborted = signal?.aborted ?? false;
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    updateState({
      status: aborted ? "canceled" : "failed",
      error: msg,
    });
  }
}

/**
 * 32장 일괄 I2V 메인 진입점.
 *
 * @example
 * const results = await batchAnimate(items, {
 *   model: "wan-fast",
 *   prompt: "subtle natural motion, looped",
 *   concurrency: 2,
 *   convertGif: true,
 *   onProgress: (done, total) => console.log(`${done}/${total}`),
 * });
 */
export async function batchAnimate(
  items: ReadonlyArray<BatchItem>,
  opts: BatchAnimateOptions = {},
): Promise<BatchResult[]> {
  if (items.length === 0) return [];

  const concurrency = clampConcurrency(opts.concurrency);
  const total = items.length;

  // 입력 순서 유지를 위해 인덱스로 매핑
  const states: BatchResult[] = items.map(makeInitialResult);
  let doneCount = 0;

  const emit = (snapshot: BatchResult) => {
    opts.onProgress?.(doneCount, total, snapshot);
  };

  // 단순 워커 풀: 각 워커가 nextIndex를 atomic하게 가져가 처리.
  // (JS는 싱글스레드이므로 별도 lock 불필요 — 워커가 i++를 한 줄에 처리)
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      if (opts.signal?.aborted) return;
      const myIndex = cursor;
      cursor += 1;
      if (myIndex >= items.length) return;

      const item = items[myIndex];
      const state = states[myIndex];
      await processOneSlot(item, state, opts, emit);

      doneCount += 1;
      opts.onProgress?.(doneCount, total, { ...state });
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return states.map((s) => ({ ...s }));
}

export interface DownloadBatchZipOptions {
  /** ZIP에 MP4 포함 (기본 true) */
  includeMp4?: boolean;
  /** ZIP에 GIF 포함 (기본 true) */
  includeGif?: boolean;
  /** 파일명 prefix (기본 "vibemoji") */
  namePrefix?: string;
}

function sanitizeName(input: string): string {
  // 파일시스템 안전 문자만 남김. 한글은 유지.
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_").slice(0, 40);
}

/**
 * batchAnimate 결과를 단일 ZIP으로 묶는다.
 * 파일명 규칙: {prefix}_{slot:02}-{label}.{mp4|gif}
 * 슬롯 패딩: 32장은 두 자리, 그 이상은 자릿수 자동.
 */
export async function downloadBatchAsZip(
  results: ReadonlyArray<BatchResult>,
  opts: DownloadBatchZipOptions = {},
): Promise<Blob> {
  const includeMp4 = opts.includeMp4 ?? true;
  const includeGif = opts.includeGif ?? true;
  const prefix = sanitizeName(opts.namePrefix ?? "vibemoji");

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const maxSlot = results.reduce((acc, r) => Math.max(acc, r.slot), 0);
  const pad = String(maxSlot).length < 2 ? 2 : String(maxSlot).length;

  for (const r of results) {
    const safeLabel = sanitizeName(r.label || `slot${r.slot}`);
    const slotStr = String(r.slot).padStart(pad, "0");
    const baseName = `${prefix}_${slotStr}-${safeLabel}`;

    if (includeMp4 && r.mp4) {
      zip.file(`${baseName}.mp4`, r.mp4);
    }
    if (includeGif && r.gif) {
      zip.file(`${baseName}.gif`, r.gif);
    }
  }

  // 실패한 슬롯이 있으면 _failed.txt에 기록 — 사용자에게 어느 슬롯이 빠졌는지 알림
  const failed = results.filter((r) => r.status === "failed" || r.status === "canceled");
  if (failed.length > 0) {
    const lines = failed.map(
      (r) => `slot ${r.slot} (${r.label}): ${r.status} — ${r.error ?? ""}`,
    );
    zip.file(
      "_failed.txt",
      `${failed.length}개 슬롯이 누락됐어요.\n\n${lines.join("\n")}\n`,
    );
  }

  return zip.generateAsync({ type: "blob" });
}

/** 비용 추정 — UI 카드용 */
export function estimateBatchCost(
  count: number,
  model: AnimateModel,
): { usd: number; perClipUsd: number } {
  const perClipUsd = model === "kling" ? 0.3 : 0.05;
  return { usd: perClipUsd * count, perClipUsd };
}
