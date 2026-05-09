/**
 * POST /api/lora/generate — 학습된 LoRA를 사용해 이미지 한 장 생성.
 *
 * Replicate `black-forest-labs/flux-dev-lora` 모델 호출.
 *   - lora_weights: 학습 결과 모델 URL ("owner/name" 또는 "owner/name:version") 또는 hf id
 *   - lora_scale: 0.0~1.0 (기본 0.8)
 *
 * Prefer: wait=10  헤더로 동기 호출 시도 → 10초 안에 끝나면 곧장 출력 URL 반환.
 * 안 끝나면 prediction id/status URL 반환 → 클라이언트에서 폴링.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPLICATE_BASE = "https://api.replicate.com/v1";

type GenerateBody = {
  token?: string;
  prompt?: string;
  loraWeights?: string;
  loraScale?: number;
  seed?: number;
  width?: number;
  height?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
  outputFormat?: "png" | "webp" | "jpg";
};

type ReplicatePrediction = {
  id?: string;
  status?: string;
  output?: string[] | string | null;
  error?: string | null;
  urls?: { get?: string; cancel?: string };
};

type ReplicateError = { detail?: string; title?: string };

function readToken(req: Request, body: GenerateBody): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth) {
    const match = auth.match(/^(?:Token|Bearer)\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  if (body.token && typeof body.token === "string") return body.token.trim();
  return null;
}

function isValidToken(token: string): boolean {
  return /^r8_[A-Za-z0-9]{36,}$/.test(token);
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function clampScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.8;
  return Math.max(0, Math.min(1.5, value));
}

function clampSteps(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 28;
  return Math.max(10, Math.min(50, Math.floor(value)));
}

function pickFirstOutput(out: ReplicatePrediction["output"]): string | null {
  if (!out) return null;
  if (typeof out === "string") return out;
  if (Array.isArray(out) && out.length > 0 && typeof out[0] === "string") {
    return out[0];
  }
  return null;
}

export async function POST(req: Request) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "잘못된 JSON 본문" },
      { status: 400 },
    );
  }

  const token = readToken(req, body);
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Replicate 토큰이 없습니다." },
      { status: 401 },
    );
  }
  if (!isValidToken(token)) {
    return NextResponse.json(
      { success: false, error: "Replicate 토큰 형식이 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const prompt =
    typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : null;
  if (!prompt) {
    return NextResponse.json(
      { success: false, error: "prompt 가 필요합니다." },
      { status: 400 },
    );
  }
  const loraWeights =
    typeof body.loraWeights === "string" && body.loraWeights.trim()
      ? body.loraWeights.trim()
      : null;
  if (!loraWeights) {
    return NextResponse.json(
      { success: false, error: "loraWeights (학습 결과 URL/id)가 필요합니다." },
      { status: 400 },
    );
  }

  const input: Record<string, unknown> = {
    prompt,
    lora_weights: loraWeights,
    lora_scale: clampScale(body.loraScale),
    num_inference_steps: clampSteps(body.numInferenceSteps),
    guidance_scale:
      typeof body.guidanceScale === "number" && Number.isFinite(body.guidanceScale)
        ? Math.max(0, Math.min(20, body.guidanceScale))
        : 3.5,
    output_format: body.outputFormat ?? "png",
    aspect_ratio: "1:1",
  };
  if (typeof body.seed === "number" && Number.isFinite(body.seed)) {
    input.seed = Math.floor(body.seed);
  }
  if (
    typeof body.width === "number" &&
    Number.isFinite(body.width) &&
    typeof body.height === "number" &&
    Number.isFinite(body.height)
  ) {
    input.width = Math.max(256, Math.min(1536, Math.floor(body.width)));
    input.height = Math.max(256, Math.min(1536, Math.floor(body.height)));
  }

  const res = await fetch(
    `${REPLICATE_BASE}/models/black-forest-labs/flux-dev-lora/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=10",
      },
      body: JSON.stringify({ input }),
    },
  );

  if (!res.ok) {
    const payload = await safeJson<ReplicateError>(res);
    return NextResponse.json(
      {
        success: false,
        error:
          payload?.detail ??
          payload?.title ??
          `생성 요청 실패 (${res.status})`,
      },
      { status: res.status },
    );
  }

  const pred = await safeJson<ReplicatePrediction>(res);
  if (!pred) {
    return NextResponse.json(
      { success: false, error: "생성 응답이 비어있습니다." },
      { status: 502 },
    );
  }

  const output = pickFirstOutput(pred.output ?? null);
  return NextResponse.json({
    success: true,
    data: {
      predictionId: pred.id ?? null,
      status: pred.status ?? "starting",
      output,
      statusUrl: pred.urls?.get ?? null,
      error: pred.error ?? null,
    },
  });
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: "POST 만 지원합니다." },
    { status: 405 },
  );
}

export type LoraGenerateResponse = {
  success: boolean;
  data?: {
    predictionId: string | null;
    status: string;
    output: string | null;
    statusUrl: string | null;
    error: string | null;
  };
  error?: string;
};
