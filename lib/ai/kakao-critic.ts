/**
 * 카카오 이모티콘 합격 사전 감사 (Kakao Critic) — Gemini 2.5 Flash 기반.
 *
 * judge.ts의 캐릭터 일관성 패턴을 6차원 카카오 합격 기준으로 확장.
 *
 * 6 dimensions (each 0-10):
 *   line / color / background / expression / consistency / copyright
 *
 * 무료 티어 rate limit 안전: concurrency default 3.
 */

import { getActiveByokKey } from "@/lib/byok";
import { blobToBase64 } from "./types";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const DEFAULT_CONCURRENCY = 3;

export type Dimension =
  | "line"
  | "color"
  | "background"
  | "expression"
  | "consistency"
  | "copyright";

export const DIMENSIONS: ReadonlyArray<Dimension> = [
  "line",
  "color",
  "background",
  "expression",
  "consistency",
  "copyright",
];

export const DIMENSION_LABEL_KO: Record<Dimension, string> = {
  line: "선/외곽선",
  color: "색",
  background: "배경",
  expression: "표정/액션",
  consistency: "캐릭터 일관성",
  copyright: "저작권 위험",
};

export type SlotAudit = {
  slot: number;
  scores: Record<Dimension, number>;
  /** weighted average (0-10) */
  overall: number;
  /** 0-1, heuristic */
  approvalProbability: number;
  /** 한국어, 3개 이내 */
  topRisks: string[];
  /** 한국어, 3개 이내 */
  suggestedFixes: string[];
};

export type SetAudit = {
  setOverall: number;
  setApprovalProb: number;
  /** 점수 낮은 상위 5개 슬롯 번호 */
  weakestSlots: number[];
  /** 32장 묶음 단위 이슈 (자동 산출) */
  setLevelIssues: string[];
  perSlot: SlotAudit[];
};

export type AuditOneOptions = {
  signal?: AbortSignal;
};

export type AuditFrameInput = {
  slot: number;
  blob: Blob;
};

export type AuditSetOptions = {
  /** 동시 실행 호출 수 (default 3) */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

export class KakaoCriticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KakaoCriticError";
  }
}

const CRITIC_PROMPT = `You are a Kakao Emoticon submission reviewer. Evaluate this single sticker frame against
the SEED reference for approval likelihood. Return ONLY JSON:
{
  "scores": { "line": N, "color": N, "background": N, "expression": N, "consistency": N, "copyright": N },
  "topRisks": ["한국어 한 문장", ...],
  "suggestedFixes": ["한국어 한 문장", ...]
}
Scoring rubric (0-10): line=outline weight consistency + thick black outline standard,
color=palette restraint (≤256, no gradients), background=clean transparency,
expression=clear messenger-context emotion readability, consistency=same character as seed,
copyright=originality (10 = clearly original, 0 = direct IP knock-off).
Each "topRisks" and "suggestedFixes" must contain at most 3 items, each a single Korean sentence.`;

type GeminiTextResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

function extractJsonBody(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();
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

function clampStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function defaultScores(): Record<Dimension, number> {
  return {
    line: 0,
    color: 0,
    background: 0,
    expression: 0,
    consistency: 0,
    copyright: 0,
  };
}

/**
 * Weighted overall score (0-10):
 *   0.3*consistency + 0.2*line + 0.15*expression + 0.15*background + 0.1*color + 0.1*copyright
 */
function computeOverall(scores: Record<Dimension, number>): number {
  const w =
    0.3 * scores.consistency +
    0.2 * scores.line +
    0.15 * scores.expression +
    0.15 * scores.background +
    0.1 * scores.color +
    0.1 * scores.copyright;
  return Math.round(w * 100) / 100;
}

/**
 * approvalProbability heuristic:
 *   base = overall / 10 (0-1)
 *   penalty if copyright<5: ×0.3
 *   penalty if consistency<6: ×0.5
 */
function computeApprovalProb(scores: Record<Dimension, number>, overall: number): number {
  let p = overall / 10;
  if (scores.copyright < 5) p *= 0.3;
  if (scores.consistency < 6) p *= 0.5;
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  return Math.round(p * 1000) / 1000;
}

function parseAuditPayload(
  raw: string,
  slot: number,
): { scores: Record<Dimension, number>; topRisks: string[]; suggestedFixes: string[] } {
  try {
    const body = extractJsonBody(raw);
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) {
      return {
        scores: defaultScores(),
        topRisks: ["응답 파싱 실패"],
        suggestedFixes: [],
      };
    }
    const obj = parsed as Record<string, unknown>;
    const rawScores =
      typeof obj.scores === "object" && obj.scores !== null
        ? (obj.scores as Record<string, unknown>)
        : {};

    const scores: Record<Dimension, number> = {
      line: clampScore(rawScores.line),
      color: clampScore(rawScores.color),
      background: clampScore(rawScores.background),
      expression: clampScore(rawScores.expression),
      consistency: clampScore(rawScores.consistency),
      copyright: clampScore(rawScores.copyright),
    };

    return {
      scores,
      topRisks: clampStringArray(obj.topRisks, 3),
      suggestedFixes: clampStringArray(obj.suggestedFixes, 3),
    };
  } catch {
    return {
      scores: defaultScores(),
      topRisks: [`슬롯 ${slot} 응답 파싱 실패`],
      suggestedFixes: [],
    };
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
            { text: CRITIC_PROMPT },
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
    throw new KakaoCriticError(`Gemini ${res.status}: ${truncated}`);
  }

  const data = (await res.json()) as GeminiTextResponse;
  for (const cand of data.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  throw new KakaoCriticError("Gemini 응답에 텍스트가 없어요.");
}

/** 시드 1장 + 변형 1장 → 1슬롯 감사 */
export async function auditOne(
  seedBlob: Blob,
  frameBlob: Blob,
  slot: number,
  opts: AuditOneOptions = {},
): Promise<SlotAudit> {
  const apiKey = getActiveByokKey();
  if (!apiKey) {
    throw new KakaoCriticError("Gemini 키 필요");
  }

  const [seedB64, frameB64] = await Promise.all([
    blobToBase64(seedBlob),
    blobToBase64(frameBlob),
  ]);

  const raw = await callGemini(apiKey, seedB64, frameB64, opts.signal);
  const { scores, topRisks, suggestedFixes } = parseAuditPayload(raw, slot);
  const overall = computeOverall(scores);
  const approvalProbability = computeApprovalProb(scores, overall);

  return {
    slot,
    scores,
    overall,
    approvalProbability,
    topRisks,
    suggestedFixes,
  };
}

/** 32장 묶음 단위 자동 이슈 산출 */
function deriveSetIssues(perSlot: ReadonlyArray<SlotAudit>): string[] {
  if (perSlot.length === 0) return [];
  const issues: string[] = [];

  const dimAvg = (d: Dimension): number =>
    perSlot.reduce((sum, s) => sum + s.scores[d], 0) / perSlot.length;

  const lineAvg = dimAvg("line");
  const colorAvg = dimAvg("color");
  const bgAvg = dimAvg("background");
  const exprAvg = dimAvg("expression");
  const consAvg = dimAvg("consistency");
  const copyAvg = dimAvg("copyright");

  if (consAvg < 6) {
    issues.push(`전체 캐릭터 일관성이 낮음 (평균 ${consAvg.toFixed(1)}/10) — 동일 캐릭터로 보이지 않는 슬롯이 다수.`);
  }
  if (bgAvg < 6) {
    issues.push(`전체 배경 처리 미흡 (평균 ${bgAvg.toFixed(1)}/10) — 투명 배경 잔여물/외곽 픽셀 점검 필요.`);
  }
  if (lineAvg < 6) {
    issues.push(`외곽선 두께/일관성 부족 (평균 ${lineAvg.toFixed(1)}/10) — 검정 굵은 라인 표준 권장.`);
  }
  if (colorAvg < 6) {
    issues.push(`색상 절제 미흡 (평균 ${colorAvg.toFixed(1)}/10) — 그라데이션/과채도 줄이고 256색 이내 권장.`);
  }
  if (exprAvg < 6) {
    issues.push(`표정/액션 가독성 약함 (평균 ${exprAvg.toFixed(1)}/10) — 메신저 컨텍스트에서 의도가 즉시 읽혀야 함.`);
  }
  if (copyAvg < 5) {
    issues.push(`저작권 위험 신호 (평균 ${copyAvg.toFixed(1)}/10) — 기존 IP 유사 의심, 인간 검토 필요.`);
  }

  // 색조 분포 단조: 색 점수 표준편차가 작고 모두 비슷한 수준이면
  const colors = perSlot.map((s) => s.scores.color);
  const colorMean = colors.reduce((a, b) => a + b, 0) / colors.length;
  const colorVar =
    colors.reduce((acc, v) => acc + (v - colorMean) ** 2, 0) / colors.length;
  if (colorVar < 0.5 && perSlot.length >= 8) {
    issues.push("32장 색조 분포가 너무 단조로움 — 슬롯별 채도/명도 변화로 시각 다양성 확보 권장.");
  }

  return issues;
}

/** 시드 1장 + 변형 N장 → 세트 감사 */
export async function auditSet(
  seedBlob: Blob,
  frames: ReadonlyArray<AuditFrameInput>,
  opts: AuditSetOptions = {},
): Promise<SetAudit> {
  const apiKey = getActiveByokKey();
  if (!apiKey) {
    throw new KakaoCriticError("Gemini 키 필요");
  }
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const total = frames.length;

  if (total === 0) {
    return {
      setOverall: 0,
      setApprovalProb: 0,
      weakestSlots: [],
      setLevelIssues: [],
      perSlot: [],
    };
  }

  // 시드는 한 번만 인코딩
  const seedB64 = await blobToBase64(seedBlob);

  const results: SlotAudit[] = new Array(total);
  let cursor = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      if (opts.signal?.aborted) {
        throw new KakaoCriticError("감사 중단됨");
      }
      const idx = cursor++;
      if (idx >= total) return;
      const frame = frames[idx];
      try {
        const frameB64 = await blobToBase64(frame.blob);
        const raw = await callGemini(apiKey, seedB64, frameB64, opts.signal);
        const { scores, topRisks, suggestedFixes } = parseAuditPayload(
          raw,
          frame.slot,
        );
        const overall = computeOverall(scores);
        const approvalProbability = computeApprovalProb(scores, overall);
        results[idx] = {
          slot: frame.slot,
          scores,
          overall,
          approvalProbability,
          topRisks,
          suggestedFixes,
        };
      } catch (err: unknown) {
        if (err instanceof KakaoCriticError && opts.signal?.aborted) throw err;
        const message = err instanceof Error ? err.message : "알 수 없는 오류";
        results[idx] = {
          slot: frame.slot,
          scores: defaultScores(),
          overall: 0,
          approvalProbability: 0,
          topRisks: [`호출 실패: ${message}`],
          suggestedFixes: [],
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

  const setOverall =
    Math.round(
      (results.reduce((s, r) => s + r.overall, 0) / results.length) * 100,
    ) / 100;
  const setApprovalProb =
    Math.round(
      (results.reduce((s, r) => s + r.approvalProbability, 0) /
        results.length) *
        1000,
    ) / 1000;

  const weakestSlots = [...results]
    .sort((a, b) => a.overall - b.overall)
    .slice(0, 5)
    .map((r) => r.slot);

  const setLevelIssues = deriveSetIssues(results);

  return {
    setOverall,
    setApprovalProb,
    weakestSlots,
    setLevelIssues,
    perSlot: results,
  };
}

/**
 * 거절 사유 + 감사 결과를 영문 카카오-aware 재생성 프롬프트로 변환.
 *
 * 출력 예시:
 *   "Kakao emoticon redo. Issues: weak outline, gradient background. Fixes: thick black outline,
 *    flat transparent background. Original feedback: <kakaoFeedback>. Keep same character as seed."
 */
export function recoveryPrompt(slot: SlotAudit, kakaoFeedback?: string): string {
  const weakDims: Dimension[] = DIMENSIONS.filter(
    (d) => slot.scores[d] < 6,
  );

  const weakClause =
    weakDims.length > 0
      ? `Weak dimensions: ${weakDims.map((d) => `${d}=${slot.scores[d]}/10`).join(", ")}.`
      : "All dimensions acceptable; minor refinement only.";

  const risksClause =
    slot.topRisks.length > 0
      ? `Issues to fix (translated from KR): ${slot.topRisks.join(" | ")}.`
      : "";

  const fixesClause =
    slot.suggestedFixes.length > 0
      ? `Suggested fixes (translated from KR): ${slot.suggestedFixes.join(" | ")}.`
      : "";

  const feedbackClause =
    kakaoFeedback && kakaoFeedback.trim()
      ? `Kakao reviewer feedback: ${kakaoFeedback.trim()}.`
      : "";

  const standards = [
    "Kakao Emoticon standards: thick black outline (consistent stroke weight)",
    "≤256-color flat palette (no gradients)",
    "fully transparent background (clean alpha edges)",
    "messenger-context expression readability",
    "keep the SAME character as the seed reference (identical proportions, colors, distinctive features)",
    "100% original artwork (no copyrighted IP)",
  ].join("; ");

  return [
    `Redo Kakao emoticon slot ${slot.slot}.`,
    weakClause,
    risksClause,
    fixesClause,
    feedbackClause,
    `Apply: ${standards}.`,
    "Output: 360x360 PNG, transparent background, single sticker, centered.",
  ]
    .filter((s) => s.trim().length > 0)
    .join(" ");
}
