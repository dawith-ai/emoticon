/**
 * 카카오 거절 메일 파서 (Reject Parser) — Gemini 2.5 Flash + 키워드 폴백.
 *
 * 사용자가 받은 카카오 거절 사유 텍스트를 6 차원으로 자동 분류.
 *  → kakao-critic의 SlotAudit과 결합해 "어떤 차원을 우선 수정해야 하는가" 결정.
 *
 * 두 가지 모드:
 *  1. parseRejectEmail: Gemini 호출 (BYOK 키 필요, 더 정확)
 *  2. classifyOffline: 순수 키워드 매칭 (네트워크/키 없이 즉시 결과)
 */

import { getActiveByokKey } from "@/lib/byok";
import {
  DIMENSIONS,
  type Dimension,
} from "@/lib/ai/kakao-critic";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const SECONDARY_THRESHOLD = 0.4;

export type RejectClassification = {
  /** 차원별 거절 사유 confidence (0-1) */
  dimensions: Record<Dimension, number>;
  /** 가장 강한 차원 (모든 점수 0이면 null) */
  primary: Dimension | null;
  /** secondary (>= 0.4) — primary 제외 */
  secondary: Dimension[];
  /** 한국어 한 문장 요약 */
  summary: string;
  /** 거절 메일 어조 */
  rawSentiment: "harsh" | "neutral" | "encouraging";
  /** 거절 메일에서 추출된 구체적 행동 가능 문장 (0-5개) */
  actionableLines: string[];
};

export type ParseRejectOptions = {
  signal?: AbortSignal;
};

export class RejectParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RejectParserError";
  }
}

// ---------------------------------------------------------------------------
// 키워드 hints — 한국어 카카오 거절 메일 일반 표현 패턴
// ---------------------------------------------------------------------------

type KeywordHint = {
  /** 가중치 1.0 = 강한 신호, 0.5 = 약한 단서 */
  weight: number;
  /** RegExp 패턴 (한국어 어절 경계 고려) */
  patterns: RegExp[];
};

const DIMENSION_HINTS: Record<Dimension, KeywordHint[]> = {
  line: [
    {
      weight: 1.0,
      patterns: [
        /외곽선/g,
        /라인\s*(?:이|가|을|두께|굵기)/g,
        /선\s*(?:이|가|두께|굵기|처리)/g,
        /선\s*굵기/g,
      ],
    },
    {
      weight: 0.8,
      patterns: [
        /잘림|잘려|잘립|잘려서/g,
        /들쭉날쭉/g,
        /삐뚤삐뚤|삐뚤어/g,
        /깔끔하지\s*(?:못|않)/g,
        /지저분/g,
      ],
    },
  ],
  color: [
    {
      weight: 1.0,
      patterns: [
        /색감/g,
        /컬러/g,
        /채도/g,
        /명도/g,
        /그라데이션|그라디언트/g,
        /색상\s*(?:이|가|선택|조합|수)/g,
      ],
    },
    {
      weight: 0.7,
      patterns: [
        /색이\s*너무/g,
        /너무\s*어둡|어두움|어두워/g,
        /너무\s*밝|밝음|밝아/g,
        /칙칙|탁한|탁해/g,
        /색감\s*조정|색\s*조정/g,
      ],
    },
  ],
  background: [
    {
      weight: 1.0,
      patterns: [
        /배경/g,
        /투명도|투명\s*(?:처리|배경|화)/g,
        /잔여물|잔여\s*픽셀/g,
        /가장자리/g,
        /흰\s*(?:라인|선|테두리|픽셀|점)/g,
        /알파\s*(?:채널|값)/g,
      ],
    },
    {
      weight: 0.7,
      patterns: [
        /외곽\s*(?:잔여|픽셀|처리)/g,
        /지우개\s*자국/g,
        /얼룩/g,
      ],
    },
  ],
  expression: [
    {
      weight: 1.0,
      patterns: [
        /표정/g,
        /의도\s*(?:가|를|파악|전달)/g,
        /감정\s*(?:이|을|전달|표현)/g,
        /명확하지\s*(?:않|못)/g,
        /알아보기\s*(?:어렵|힘들)/g,
        /어떤\s*(?:감정|의미|의도)인지/g,
      ],
    },
    {
      weight: 0.6,
      patterns: [
        /애매|모호/g,
        /읽히지\s*않/g,
        /전달력/g,
        /어색|부자연/g,
      ],
    },
  ],
  consistency: [
    {
      weight: 1.0,
      patterns: [
        /캐릭터\s*일관성/g,
        /다른\s*(?:캐릭터|인물|사람)/g,
        /같은\s*(?:인물|캐릭터)\s*(?:이|가|로)?\s*(?:보이지\s*않|아닌)/g,
        /동일\s*(?:한)?\s*(?:캐릭터|인물)/g,
        /비례/g,
        /모양이\s*(?:다름|달라|다르)/g,
      ],
    },
    {
      weight: 0.7,
      patterns: [
        /일관\s*(?:되지|성)/g,
        /통일\s*(?:감|성)/g,
        /각기\s*다른/g,
        /제각각/g,
      ],
    },
  ],
  copyright: [
    {
      weight: 1.0,
      patterns: [
        /저작권/g,
        /표절/g,
        /유사\s*(?:한|성|함)/g,
        /기존\s*(?:캐릭터|이모티콘|작품|IP)/g,
        /\bIP\b/g,
        /모방/g,
        /도용/g,
      ],
    },
    {
      weight: 0.6,
      patterns: [
        /비슷한\s*(?:캐릭터|이모티콘|작품)/g,
        /떠올리게\s*(?:함|해)/g,
        /연상/g,
      ],
    },
  ],
};

const HARSH_HINTS = [
  /거절/,
  /부적합/,
  /부족/,
  /불가/,
  /미흡/,
  /불충분/,
  /기준\s*(?:에|을)\s*(?:미달|충족하지)/,
];

const ENCOURAGING_HINTS = [
  /수정\s*(?:후|하면|하시면)/,
  /보완/,
  /기대/,
  /가능성/,
  /다시\s*(?:신청|제안|도전)/,
  /응원/,
];

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------

function emptyDimensions(): Record<Dimension, number> {
  return {
    line: 0,
    color: 0,
    background: 0,
    expression: 0,
    consistency: 0,
    copyright: 0,
  };
}

function clampUnit(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 1000) / 1000;
}

function clampSentiment(value: unknown): "harsh" | "neutral" | "encouraging" {
  if (value === "harsh" || value === "neutral" || value === "encouraging") {
    return value;
  }
  return "neutral";
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

function isDimensionString(value: unknown): value is Dimension {
  return (
    typeof value === "string" &&
    (DIMENSIONS as ReadonlyArray<string>).includes(value)
  );
}

function buildPrimaryAndSecondary(
  dims: Record<Dimension, number>,
): { primary: Dimension | null; secondary: Dimension[] } {
  const sorted = [...DIMENSIONS].sort((a, b) => dims[b] - dims[a]);
  const top = sorted[0];
  if (!top || dims[top] <= 0) {
    return { primary: null, secondary: [] };
  }
  const primary: Dimension = top;
  const secondary: Dimension[] = sorted
    .filter((d) => d !== primary && dims[d] >= SECONDARY_THRESHOLD)
    .slice(0, 5);
  return { primary, secondary };
}

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

// ---------------------------------------------------------------------------
// 오프라인 키워드 분석
// ---------------------------------------------------------------------------

/**
 * 키워드 매칭만으로 거절 사유 분류 (네트워크/키 없이 동작).
 *
 * 점수 산식:
 *   각 차원별 hint 매칭 가중치 합산 → tanh로 0-1 정규화.
 *   tanh(weightSum * 0.6)로 1-2개 강한 매칭에서도 유의미한 신호가 나오도록 튜닝.
 */
export function classifyOffline(text: string): RejectClassification {
  const dims = emptyDimensions();
  const safeText = (text ?? "").trim();
  if (!safeText) {
    return {
      dimensions: dims,
      primary: null,
      secondary: [],
      summary: "[키워드 기반 분석] 입력 텍스트가 비어 있어요.",
      rawSentiment: "neutral",
      actionableLines: [],
    };
  }

  for (const dim of DIMENSIONS) {
    let weightSum = 0;
    for (const hint of DIMENSION_HINTS[dim]) {
      for (const pattern of hint.patterns) {
        // 새 RegExp 생성으로 lastIndex 리셋 안전
        const localPattern = new RegExp(pattern.source, pattern.flags);
        const matches = safeText.match(localPattern);
        if (matches && matches.length > 0) {
          // 같은 패턴 반복 매칭은 0.5씩 감쇠 가산
          weightSum += hint.weight * (1 + Math.min(matches.length - 1, 3) * 0.5);
        }
      }
    }
    // tanh 정규화 → 강한 매칭 1개로도 0.5+ 도달
    const normalized = Math.tanh(weightSum * 0.6);
    dims[dim] = Math.round(normalized * 1000) / 1000;
  }

  const { primary, secondary } = buildPrimaryAndSecondary(dims);

  // sentiment
  let rawSentiment: "harsh" | "neutral" | "encouraging" = "neutral";
  const harshScore = HARSH_HINTS.reduce(
    (acc, p) => acc + (p.test(safeText) ? 1 : 0),
    0,
  );
  const encouragingScore = ENCOURAGING_HINTS.reduce(
    (acc, p) => acc + (p.test(safeText) ? 1 : 0),
    0,
  );
  if (harshScore >= 2 && harshScore > encouragingScore) {
    rawSentiment = "harsh";
  } else if (encouragingScore >= 2 && encouragingScore > harshScore) {
    rawSentiment = "encouraging";
  }

  // actionable lines: 문장 단위 분리 후 차원 키워드 포함 문장 추출
  const sentences = safeText
    .split(/(?<=[.!?。！？\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 200);

  const actionableLines: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    let touched = false;
    for (const dim of DIMENSIONS) {
      for (const hint of DIMENSION_HINTS[dim]) {
        for (const pattern of hint.patterns) {
          const localPattern = new RegExp(pattern.source, pattern.flags);
          if (localPattern.test(sentence)) {
            touched = true;
            break;
          }
        }
        if (touched) break;
      }
      if (touched) break;
    }
    if (touched && !seen.has(sentence)) {
      seen.add(sentence);
      actionableLines.push(sentence);
      if (actionableLines.length >= 5) break;
    }
  }

  // summary
  const primaryLabel = primary
    ? `[${primary}]`
    : "[명확한 차원 신호 없음]";
  const score = primary ? dims[primary].toFixed(2) : "0.00";
  const summary = `[키워드 기반 분석] 주요 거절 차원 ${primaryLabel} confidence ${score}. ${
    secondary.length > 0
      ? `추가 약점: ${secondary.join(", ")}.`
      : "추가 약점은 검출되지 않았어요."
  }`;

  return {
    dimensions: dims,
    primary,
    secondary,
    summary,
    rawSentiment,
    actionableLines,
  };
}

// ---------------------------------------------------------------------------
// Gemini 호출
// ---------------------------------------------------------------------------

const REJECT_PROMPT = `You are classifying a Kakao Emoticon REJECTION email body into 6 review dimensions.
Dimensions: line, color, background, expression, consistency, copyright.

Common Korean phrases by dimension (hints, not exhaustive):
- line: 외곽선, 라인, 선 두께, 잘림, 들쭉날쭉, 깔끔하지 못
- color: 색감, 컬러, 채도, 명도, 색이 너무, 그라데이션, 어두움
- background: 배경, 투명도, 잔여물, 가장자리, 흰 라인
- expression: 표정, 의도, 감정, 명확하지, 알아보기 어려, 어떤 감정인지
- consistency: 캐릭터 일관성, 다른 캐릭터, 같은 인물, 비례, 모양이 다름
- copyright: 저작권, 표절, 유사, 기존, IP, 모방

Output ONLY JSON:
{
  "dimensions": { "line": 0.0-1.0, "color": 0.0-1.0, "background": 0.0-1.0, "expression": 0.0-1.0, "consistency": 0.0-1.0, "copyright": 0.0-1.0 },
  "primary": "line" | "color" | "background" | "expression" | "consistency" | "copyright" | null,
  "secondary": ["..."],
  "summary": "한국어 한 문장",
  "rawSentiment": "harsh" | "neutral" | "encouraging",
  "actionableLines": ["거절 메일에서 추출된 구체적 행동 가능 문장 0-5개 (한국어)"]
}
Score 0.0–1.0 = confidence that this dimension is the reject cause.
"primary" must be the dimension with the highest score (or null when all scores are 0).
"secondary" must list dimensions whose score is >= 0.4 excluding primary.
"summary" must be a SINGLE Korean sentence.
"actionableLines" entries must be Korean sentences taken/paraphrased from the email body.`;

type GeminiTextResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

async function callGeminiReject(
  apiKey: string,
  text: string,
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
            { text: REJECT_PROMPT },
            { text: `\n--- REJECTION EMAIL BODY ---\n${text}\n--- END ---` },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const truncated = body.length > 240 ? `${body.slice(0, 240)}…` : body;
    throw new RejectParserError(`Gemini ${res.status}: ${truncated}`);
  }

  const data = (await res.json()) as GeminiTextResponse;
  for (const cand of data.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  throw new RejectParserError("Gemini 응답에 텍스트가 없어요.");
}

function safeFallback(rawText: string): RejectClassification {
  // Gemini 실패 시 키워드 분석으로 안전 회수
  const offline = classifyOffline(rawText);
  return {
    ...offline,
    summary: `[Gemini 응답 파싱 실패 — 키워드 폴백] ${offline.summary}`,
  };
}

function parseRejectPayload(raw: string, originalText: string): RejectClassification {
  try {
    const body = extractJsonBody(raw);
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) {
      return safeFallback(originalText);
    }
    const obj = parsed as Record<string, unknown>;

    const rawDims =
      typeof obj.dimensions === "object" && obj.dimensions !== null
        ? (obj.dimensions as Record<string, unknown>)
        : {};

    const dimensions: Record<Dimension, number> = {
      line: clampUnit(rawDims.line),
      color: clampUnit(rawDims.color),
      background: clampUnit(rawDims.background),
      expression: clampUnit(rawDims.expression),
      consistency: clampUnit(rawDims.consistency),
      copyright: clampUnit(rawDims.copyright),
    };

    let primary: Dimension | null = null;
    if (isDimensionString(obj.primary)) {
      primary = obj.primary;
    } else if (obj.primary !== null) {
      // 추론 실패 시 직접 도출
      primary = buildPrimaryAndSecondary(dimensions).primary;
    }

    let secondary: Dimension[] = [];
    if (Array.isArray(obj.secondary)) {
      const seen = new Set<Dimension>();
      for (const item of obj.secondary) {
        if (!isDimensionString(item)) continue;
        if (item === primary) continue;
        if (seen.has(item)) continue;
        seen.add(item);
        secondary.push(item);
      }
    }
    if (secondary.length === 0) {
      secondary = buildPrimaryAndSecondary(dimensions).secondary;
    }

    const summary =
      typeof obj.summary === "string" && obj.summary.trim()
        ? obj.summary.trim()
        : "분석 결과 요약을 생성하지 못했어요.";

    return {
      dimensions,
      primary,
      secondary,
      summary,
      rawSentiment: clampSentiment(obj.rawSentiment),
      actionableLines: clampStringArray(obj.actionableLines, 5),
    };
  } catch {
    return safeFallback(originalText);
  }
}

/**
 * Gemini 2.5 Flash 호출로 카카오 거절 메일 본문을 분류.
 *
 * BYOK 키 없으면 RejectParserError throw.
 * 응답 파싱 실패는 safeFallback (키워드 분석)으로 회수 — throw 하지 않음.
 */
export async function parseRejectEmail(
  text: string,
  opts: ParseRejectOptions = {},
): Promise<RejectClassification> {
  const apiKey = getActiveByokKey();
  if (!apiKey) {
    throw new RejectParserError("Gemini 키 필요");
  }

  const safeText = (text ?? "").trim();
  if (!safeText) {
    return {
      dimensions: emptyDimensions(),
      primary: null,
      secondary: [],
      summary: "입력 텍스트가 비어 있어요.",
      rawSentiment: "neutral",
      actionableLines: [],
    };
  }

  try {
    const raw = await callGeminiReject(apiKey, safeText, opts.signal);
    return parseRejectPayload(raw, safeText);
  } catch (err: unknown) {
    if (err instanceof RejectParserError) {
      // 네트워크/HTTP 오류는 폴백
      return safeFallback(safeText);
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    return safeFallback(safeText);
  }
}

// ---------------------------------------------------------------------------
// 감사 결과와 합산
// ---------------------------------------------------------------------------

export type MergedAudit = {
  /** 우선 수정해야 할 차원 (거절 신호 강 + 우리 점수 낮음) */
  focusDimensions: Dimension[];
  /** 차원별 가중 점수 (0-1, 높을수록 시급) */
  weightedDimensionScores: Record<Dimension, number>;
};

/**
 * 거절 메일 분류 + 우리의 SetAudit 차원 점수를 가중 평균.
 *
 * 입력:
 *  - parsed.dimensions: 거절 confidence (0-1)
 *  - auditDimensions: 우리 감사 점수 (0-10)
 *
 * 시급도 = rejectConfidence * (1 - auditScore/10)
 *  → 거절에서 강하게 지적된 차원의 우리 점수가 낮으면 시급도 큼.
 *
 * focusDimensions = 시급도 0.3 이상인 차원, 시급도 내림차순.
 */
export function mergeWithAudit(
  parsed: RejectClassification,
  auditDimensions: Record<Dimension, number>,
): MergedAudit {
  const weighted = emptyDimensions();
  for (const dim of DIMENSIONS) {
    const reject = parsed.dimensions[dim] ?? 0;
    const auditRaw = auditDimensions[dim];
    const audit =
      typeof auditRaw === "number" && Number.isFinite(auditRaw)
        ? Math.max(0, Math.min(10, auditRaw))
        : 10;
    const urgency = reject * (1 - audit / 10);
    weighted[dim] = Math.round(urgency * 1000) / 1000;
  }

  const focusDimensions = [...DIMENSIONS]
    .filter((d) => weighted[d] >= 0.3)
    .sort((a, b) => weighted[b] - weighted[a]);

  return {
    focusDimensions,
    weightedDimensionScores: weighted,
  };
}
