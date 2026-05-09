/**
 * 클라이언트 사이드 I2V 헬퍼.
 * - Next.js API 라우트(`/api/animate/*`)에 BYOK 토큰을 자동으로 실어 보낸다.
 * - 실제 Replicate 호출은 서버에서 위임 처리.
 */

import { getActiveReplicateKey } from "@/lib/byok-replicate";

export type AnimateModel = "wan-fast" | "kling";

export interface StartAnimationOptions {
  /** 동작 묘사. 비우면 기본 idle 모션 */
  prompt?: string;
  /** 결정성을 위해 시드 고정 가능 */
  seed?: number;
  /** 모델 선택 (기본 'wan-fast') */
  model?: AnimateModel;
}

export interface AnimateStatus {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled" | string;
  videoUrl: string | null;
  progress: number | null;
  error: string | null;
}

export interface AnimateProgress {
  status: AnimateStatus["status"];
  progress: number | null;
  attempt: number;
}

class TokenMissingError extends Error {
  constructor() {
    super("Replicate 토큰이 없어요. 우측 상단 BYOK 입력란에 등록해 주세요.");
    this.name = "TokenMissingError";
  }
}

function requireToken(): string {
  const token = getActiveReplicateKey();
  if (!token) throw new TokenMissingError();
  return token;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader returned non-string result"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}

async function parseJsonOrThrow(res: Response): Promise<Record<string, unknown>> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`서버가 JSON이 아닌 응답을 반환했어요 (HTTP ${res.status})`);
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("서버 응답 형식이 올바르지 않아요");
  }
  const obj = json as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof obj.error === "string" ? obj.error : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return obj;
}

/**
 * 정적 이미지(Blob)를 I2V 생성 큐에 투입한다. predictionId 반환.
 */
export async function startAnimation(
  imageBlob: Blob,
  opts: StartAnimationOptions = {},
): Promise<string> {
  const token = requireToken();
  const dataUrl = await blobToDataUrl(imageBlob);

  const res = await fetch("/api/animate/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      image: dataUrl,
      prompt: opts.prompt,
      seed: opts.seed,
      model: opts.model ?? "wan-fast",
    }),
  });

  const data = await parseJsonOrThrow(res);
  const id = data.id;
  if (typeof id !== "string" || !id) {
    throw new Error("predictionId를 받지 못했어요");
  }
  return id;
}

/**
 * 단발성 상태 조회.
 */
export async function fetchAnimationStatus(predictionId: string): Promise<AnimateStatus> {
  const token = requireToken();
  const res = await fetch(
    `/api/animate/status?id=${encodeURIComponent(predictionId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const data = await parseJsonOrThrow(res);
  const status = typeof data.status === "string" ? data.status : "unknown";
  const videoUrl = typeof data.videoUrl === "string" ? data.videoUrl : null;
  const progress = typeof data.progress === "number" ? data.progress : null;
  const error = typeof data.error === "string" ? data.error : null;
  return {
    id: predictionId,
    status,
    videoUrl,
    progress,
    error,
  };
}

export interface PollOptions {
  /** 폴링 간격 (ms). 기본 3000 */
  intervalMs?: number;
  /** 최대 시도 횟수. 기본 100 (≈ 5분) */
  maxAttempts?: number;
  /** 외부 abort 신호 */
  signal?: AbortSignal;
}

/**
 * 완료까지 폴링한 뒤 succeeded면 video URL 반환, failed/canceled면 throw.
 */
export async function pollAnimationStatus(
  predictionId: string,
  onProgress?: (p: AnimateProgress) => void,
  opts: PollOptions = {},
): Promise<string> {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 100;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new Error("애니메이션 생성이 취소되었어요");
    }
    const snap = await fetchAnimationStatus(predictionId);
    onProgress?.({ status: snap.status, progress: snap.progress, attempt });

    if (snap.status === "succeeded") {
      if (!snap.videoUrl) {
        throw new Error("성공이지만 비디오 URL을 찾을 수 없어요");
      }
      return snap.videoUrl;
    }
    if (snap.status === "failed") {
      throw new Error(snap.error ?? "Replicate 생성이 실패했어요");
    }
    if (snap.status === "canceled") {
      throw new Error("Replicate 생성이 취소되었어요");
    }

    await wait(intervalMs, opts.signal);
  }

  throw new Error(`타임아웃: ${maxAttempts}회 폴링 후에도 완료되지 않았어요`);
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new Error("aborted"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 결과 video URL을 다운로드 가능한 Blob으로 가져온다.
 * Replicate CDN은 일반적으로 CORS를 허용한다.
 */
export async function downloadAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    throw new Error(`다운로드 실패 (HTTP ${res.status})`);
  }
  return res.blob();
}
