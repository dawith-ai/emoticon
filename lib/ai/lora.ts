/**
 * LoRA 학습/생성 클라이언트 헬퍼 (no React).
 *
 * 사용 흐름:
 *   1) buildSeedZipBlob(File[])  → 시드 이미지 → ZIP Blob
 *   2) uploadSeedZip(uid, zip)   → Firebase Storage 업로드 → 다운로드 URL
 *   3) startLoraTraining(zipUrl) → 서버 라우트 호출 → trainingId 반환
 *   4) pollLoraStatus(trainingId, onProgress) → 학습 완료까지 폴링 → weights URL
 *   5) generateWithLora(weightsUrl, prompt) → Blob
 *
 * 토큰은 항상 getActiveReplicateKey()로 자동 주입.
 */
import JSZip from "jszip";
import { getActiveReplicateKey } from "@/lib/byok-replicate";
import { getClientStorage } from "@/lib/firebase/storage";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

export type LoraTrainingStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "queued";

export type LoraTrainStartResult = {
  trainingId: string;
  status: string;
  destination: string;
  triggerWord: string;
  steps: number;
};

export type LoraStatusSnapshot = {
  id: string;
  status: LoraTrainingStatus | string;
  progress: number;
  weights: string | null;
  logsTail: string;
  error: string | null;
};

export type LoraGenerateOptions = {
  loraScale?: number;
  seed?: number;
  width?: number;
  height?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
  outputFormat?: "png" | "webp" | "jpg";
};

export class LoraError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LoraError";
    this.status = status;
  }
}

function requireToken(): string {
  const token = getActiveReplicateKey();
  if (!token) {
    throw new LoraError(
      "Replicate 토큰이 없거나 약관 동의가 안 돼 있어요. 페이지 상단에서 키를 등록해주세요.",
      401,
    );
  }
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Token ${token}`,
  };
}

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: string };
type ApiResponse<T> = ApiOk<T> | ApiErr;

async function parseApi<T>(res: Response): Promise<T> {
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new LoraError(`서버 응답 파싱 실패 (${res.status})`, res.status);
  }
  if (!payload || !payload.success) {
    const message =
      payload && "error" in payload && payload.error
        ? payload.error
        : `요청 실패 (${res.status})`;
    throw new LoraError(message, res.status);
  }
  return payload.data;
}

/* ─────────────────────────── ZIP 빌드 ─────────────────────────── */

/**
 * 시드 이미지(File 또는 Blob) 1~10장을 받아 Replicate 학습기가 받는 ZIP Blob을 생성.
 * 파일명은 충돌 없도록 정규화.
 */
export async function buildSeedZipBlob(images: ReadonlyArray<File | Blob>): Promise<Blob> {
  if (images.length === 0) {
    throw new LoraError("최소 1장 이상의 시드 이미지가 필요합니다.");
  }
  if (images.length > 12) {
    throw new LoraError("시드 이미지는 최대 12장까지만 권장합니다.");
  }
  const zip = new JSZip();
  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const ext = inferExtension(item);
    const name = `seed_${String(i + 1).padStart(2, "0")}.${ext}`;
    const buf = await item.arrayBuffer();
    zip.file(name, buf);
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

function inferExtension(item: File | Blob): string {
  const type = (item.type ?? "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (item instanceof File) {
    const m = item.name.match(/\.([a-zA-Z0-9]+)$/);
    if (m) return m[1].toLowerCase();
  }
  return "png";
}

/* ────────────────────────── Storage 업로드 ────────────────────────── */

/**
 * 시드 ZIP을 Firebase Storage에 올리고 다운로드 URL 반환.
 * uid 가 없으면 'guest' 폴더 사용.
 */
export async function uploadSeedZip(uid: string | null, zip: Blob): Promise<string> {
  const storage = getClientStorage();
  if (!storage) {
    throw new LoraError(
      "Firebase Storage 가 설정되지 않아 ZIP을 업로드할 수 없어요. 환경 설정을 확인해주세요.",
    );
  }
  const safeUid = uid && /^[A-Za-z0-9_-]+$/.test(uid) ? uid : "guest";
  const path = `users/${safeUid}/lora/seed-${Date.now()}.zip`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, zip, { contentType: "application/zip" });
  return getDownloadURL(ref);
}

/* ────────────────────────── Train / Status / Generate ────────────────────────── */

export type StartLoraTrainingArgs = {
  inputImagesUrl: string;
  triggerWord?: string;
  steps?: number;
};

export async function startLoraTraining(
  args: StartLoraTrainingArgs,
): Promise<LoraTrainStartResult> {
  const token = requireToken();
  const res = await fetch("/api/lora/train", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      inputImagesUrl: args.inputImagesUrl,
      triggerWord: args.triggerWord,
      steps: args.steps,
    }),
  });
  return parseApi<LoraTrainStartResult>(res);
}

export async function fetchLoraStatus(trainingId: string): Promise<LoraStatusSnapshot> {
  const token = requireToken();
  const res = await fetch(
    `/api/lora/status?id=${encodeURIComponent(trainingId)}`,
    {
      method: "GET",
      headers: { Authorization: `Token ${token}` },
    },
  );
  return parseApi<LoraStatusSnapshot>(res);
}

export type PollOptions = {
  /** 폴링 간격 ms (default 5000) */
  intervalMs?: number;
  /** 최대 시도 (default 240 → 약 20분) */
  maxAttempts?: number;
  /** 진행 상태 콜백 */
  onProgress?: (snapshot: LoraStatusSnapshot) => void;
  /** 외부 취소 신호 */
  signal?: AbortSignal;
};

const TERMINAL: ReadonlySet<string> = new Set(["succeeded", "failed", "canceled"]);

export async function pollLoraStatus(
  trainingId: string,
  options: PollOptions = {},
): Promise<LoraStatusSnapshot> {
  const interval = options.intervalMs ?? 5000;
  const max = options.maxAttempts ?? 240;
  for (let attempt = 0; attempt < max; attempt++) {
    if (options.signal?.aborted) {
      throw new LoraError("폴링이 취소되었습니다.");
    }
    const snapshot = await fetchLoraStatus(trainingId);
    options.onProgress?.(snapshot);
    if (TERMINAL.has(snapshot.status)) {
      if (snapshot.status === "succeeded") return snapshot;
      throw new LoraError(
        snapshot.error ?? `학습이 ${snapshot.status} 상태로 종료되었습니다.`,
      );
    }
    await delay(interval, options.signal);
  }
  throw new LoraError("학습이 최대 시도 횟수를 초과했습니다 (timeout).");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LoraError("취소됨"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new LoraError("취소됨"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

export async function generateWithLora(
  loraWeights: string,
  prompt: string,
  options: LoraGenerateOptions = {},
): Promise<Blob> {
  const token = requireToken();
  const res = await fetch("/api/lora/generate", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      loraWeights,
      prompt,
      loraScale: options.loraScale ?? 0.8,
      seed: options.seed,
      width: options.width,
      height: options.height,
      numInferenceSteps: options.numInferenceSteps,
      guidanceScale: options.guidanceScale,
      outputFormat: options.outputFormat ?? "png",
    }),
  });
  const data = await parseApi<{
    predictionId: string | null;
    status: string;
    output: string | null;
    statusUrl: string | null;
    error: string | null;
  }>(res);
  if (data.error) {
    throw new LoraError(data.error);
  }
  if (!data.output) {
    throw new LoraError(
      "생성이 아직 처리 중이에요. 잠시 후 다시 시도해주세요. (Prefer: wait=10 초과)",
    );
  }
  const imgRes = await fetch(data.output);
  if (!imgRes.ok) {
    throw new LoraError(`이미지 다운로드 실패 (${imgRes.status})`);
  }
  return imgRes.blob();
}

/* ────────────────────────── localStorage cache ────────────────────────── */

const LORA_KEY_PREFIX = "vibemoji.lora.";

export type StoredLoraRecord = {
  trainingId: string;
  destination: string;
  weights: string;
  triggerWord: string;
  createdAt: number;
};

export function saveLoraRecord(userId: string | null, record: StoredLoraRecord): void {
  if (typeof window === "undefined") return;
  const id = userId && userId.trim() ? userId : "guest";
  try {
    const key = `${LORA_KEY_PREFIX}${id}`;
    const existingRaw = window.localStorage.getItem(key);
    const list: StoredLoraRecord[] = existingRaw ? safeParseList(existingRaw) : [];
    list.unshift(record);
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
  } catch {
    // localStorage quota 초과 등 — 조용히 무시
  }
}

export function loadLoraRecords(userId: string | null): StoredLoraRecord[] {
  if (typeof window === "undefined") return [];
  const id = userId && userId.trim() ? userId : "guest";
  try {
    const raw = window.localStorage.getItem(`${LORA_KEY_PREFIX}${id}`);
    if (!raw) return [];
    return safeParseList(raw);
  } catch {
    return [];
  }
}

function safeParseList(raw: string): StoredLoraRecord[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredLoraRecord => {
      if (!item || typeof item !== "object") return false;
      const r = item as Record<string, unknown>;
      return (
        typeof r.trainingId === "string" &&
        typeof r.destination === "string" &&
        typeof r.weights === "string" &&
        typeof r.triggerWord === "string" &&
        typeof r.createdAt === "number"
      );
    });
  } catch {
    return [];
  }
}
