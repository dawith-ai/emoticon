/**
 * LLM-judge 자동 QC — Gemini 2.5 Flash로 시드와 변형의 캐릭터 일관성 점수화.
 *
 * 핵심: 시드(reference) 1장 + 변형 1장씩 N번 호출 → score 0-10, 한국어 사유.
 *       BYOK Gemini 키로 운영자 비용 0원, 사용자 무료 티어 안에서 동작.
 *
 * 무료 티어 rate limit: 분당 ~10회 → 32장 처리 시 약 3-4분 소요 (concurrency=3 기본).
 *
 * 보안: 사용자 키만 사용. 우리 서버 거치지 않음. 키는 호출 시 즉시 사용 후 변수 폐기.
 */

import { getActiveByokKey } from "@/lib/byok";
import { blobToBase64 } from "./types";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const DEFAULT_THRESHOLD = 7;
const DEFAULT_CONCURRENCY = 3;

const JUDGE_PROMPT = `You are evaluating whether two images show the same character.
Image 1 is the SEED reference. Image 2 is a variant.
Score 0–10 — 10: identical character (same color, same proportions, same distinctive features), 5: similar but visibly different (e.g. different fur color, different eyes), 0: completely different character/object.
Respond ONLY in JSON: {"score": N, "reason": "한국어 한 문장"}.`;

export type JudgeVerdict = {
  /** 0-10 정수 점수 (10이 동일 캐릭터) */
  score: number;
  /** threshold 이상이면 true */
  consistent: boolean;
  /** 한국어 한 문장 사유 */
  reason: string;
};

export type JudgeOneOptions = {
  /** consistent 판정 임계값 (default 7) */
  threshold?: number;
  /** 호출 중단용 */
  signal?: AbortSignal;
};

export type JudgeBatchOptions = {
  threshold?: number;
  /** 동시 실행 호출 수 (default 3) */
  concurrency?: number;
  /** 진행률 콜백 */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

export type JudgeFrameInput = {
  slot: number;
  blob: Blob;
};

export type JudgeBatchResult = {
  slot: number;
  verdict: JudgeVerdict;
};

export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeError";
  }
}

type GeminiTextResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

/** ```json … ``` 블록 / 트레일링 텍스트를 제거하고 JSON 본문만 추출 */
function extractJsonBody(raw: string): string {
  const trimmed = raw.trim();
  // ```json ... ``` 또는 ``` ... ``` 코드펜스 제거
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  // 첫 { 부터 마지막 } 까지 추출 (앞뒤 잡설 대비)
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

function clampScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 10) return 10;
  return Math.round(value);
}

function parseVerdict(raw: string, threshold: number): JudgeVerdict {
  try {
    const body = extractJsonBody(raw);
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) {
      return { score: 0, consistent: false, reason: "응답 파싱 실패" };
    }
    const obj = parsed as Record<string, unknown>;
    const score = clampScore(obj.score);
    const reason =
      typeof obj.reason === "string" && obj.reason.trim()
        ? obj.reason.trim()
        : "사유 없음";
    return {
      score,
      consistent: score >= threshold,
      reason,
    };
  } catch {
    return { score: 0, consistent: false, reason: "응답 파싱 실패" };
  }
}

async function callGemini(
  apiKey: string,
  seedB64: string,
  frameB64: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: JUDGE_PROMPT },
            { inlineData: { mimeType: "image/png", data: seedB64 } },
            { inlineData: { mimeType: "image/png", data: frameB64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const truncated = text.length > 240 ? `${text.slice(0, 240)}…` : text;
    throw new JudgeError(`Gemini ${res.status}: ${truncated}`);
  }

  const data = (await res.json()) as GeminiTextResponse;
  for (const cand of data.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  throw new JudgeError("Gemini 응답에 텍스트가 없어요.");
}

/** 시드 1장 + 변형 1장 → 일관성 점수 1건 */
export async function judgeOne(
  seedBlob: Blob,
  frameBlob: Blob,
  opts: JudgeOneOptions = {},
): Promise<JudgeVerdict> {
  const apiKey = getActiveByokKey();
  if (!apiKey) {
    throw new JudgeError("Gemini 키 필요");
  }
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  const [seedB64, frameB64] = await Promise.all([
    blobToBase64(seedBlob),
    blobToBase64(frameBlob),
  ]);

  const raw = await callGemini(apiKey, seedB64, frameB64, opts.signal);
  return parseVerdict(raw, threshold);
}

/**
 * 시드 1장 + 변형 N장 → 슬롯별 일관성 점수.
 *
 * 동시성 제한(default 3)으로 Gemini 무료 티어 분당 ~10회 한도를 준수.
 * AbortSignal로 중단 가능, onProgress로 진행률 노출.
 */
export async function judgeBatch(
  seedBlob: Blob,
  frames: ReadonlyArray<JudgeFrameInput>,
  opts: JudgeBatchOptions = {},
): Promise<JudgeBatchResult[]> {
  const apiKey = getActiveByokKey();
  if (!apiKey) {
    throw new JudgeError("Gemini 키 필요");
  }
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const total = frames.length;

  // 시드는 한 번만 base64 인코딩
  const seedB64 = await blobToBase64(seedBlob);

  const results: JudgeBatchResult[] = new Array(total);
  let cursor = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      if (opts.signal?.aborted) {
        throw new JudgeError("판정 중단됨");
      }
      const idx = cursor++;
      if (idx >= total) return;
      const frame = frames[idx];
      try {
        const frameB64 = await blobToBase64(frame.blob);
        const raw = await callGemini(apiKey, seedB64, frameB64, opts.signal);
        results[idx] = {
          slot: frame.slot,
          verdict: parseVerdict(raw, threshold),
        };
      } catch (err: unknown) {
        if (err instanceof JudgeError) throw err;
        const message =
          err instanceof Error ? err.message : "알 수 없는 오류";
        results[idx] = {
          slot: frame.slot,
          verdict: {
            score: 0,
            consistent: false,
            reason: `호출 실패: ${message}`,
          },
        };
      }
      done++;
      opts.onProgress?.(done, total);
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
