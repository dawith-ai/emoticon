/**
 * POST /api/animate/start
 *
 * 정적 이미지 1장을 받아 Replicate I2V (Image-to-Video) 모델로 짧은 클립 생성을 시작한다.
 *
 * - 토큰은 BYOK: 클라이언트가 헤더 또는 body로 전달, 서버는 저장하지 않고 Replicate에 그대로 위임.
 * - 모델 식별자는 서버에서 화이트리스트 매핑하여 임의 모델 호출을 방지한다.
 *
 * Request body:
 *   {
 *     token: string,                // r8_... (또는 Authorization 헤더로도 가능)
 *     image: string,                // data URL ('data:image/png;base64,...') 또는 호스팅 URL
 *     prompt?: string,              // 동작 묘사. 없으면 기본 프롬프트.
 *     seed?: number,
 *     model?: 'wan-fast' | 'kling'  // 기본 'wan-fast'
 *   }
 *
 * Response:
 *   200 → { id: string, status: string }
 *   4xx/5xx → { error: string }
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModelKey = "wan-fast" | "kling";

type ModelSpec = {
  /** Replicate `models/{owner}/{name}/predictions` endpoint를 사용 */
  owner: string;
  name: string;
  /** 모델별 input 스키마 어댑터 */
  buildInput: (image: string, prompt: string, seed?: number) => Record<string, unknown>;
};

const DEFAULT_PROMPT =
  "subtle natural motion, gentle expression change, looped, soft idle animation";

const MODEL_REGISTRY: Record<ModelKey, ModelSpec> = {
  "wan-fast": {
    owner: "wan-video",
    name: "wan-2.2-i2v-fast",
    buildInput: (image, prompt, seed) => {
      const input: Record<string, unknown> = {
        image,
        prompt,
      };
      if (typeof seed === "number" && Number.isFinite(seed)) input.seed = seed;
      return input;
    },
  },
  kling: {
    owner: "kwaivgi",
    name: "kling-v2.0",
    buildInput: (image, prompt, seed) => {
      const input: Record<string, unknown> = {
        start_image: image,
        prompt,
        duration: 5,
        aspect_ratio: "1:1",
      };
      if (typeof seed === "number" && Number.isFinite(seed)) input.seed = seed;
      return input;
    },
  },
};

const REPLICATE_KEY_PATTERN = /^r8_[A-Za-z0-9]{36,}$/;

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return isString(v) ? v : undefined;
}

function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function isModelKey(v: unknown): v is ModelKey {
  return v === "wan-fast" || v === "kling";
}

function extractToken(req: Request, body: Record<string, unknown>): string | undefined {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const fromBody = getString(body, "token");
  return fromBody?.trim();
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = extractToken(req, body);
  if (!token) {
    return NextResponse.json({ error: "Missing Replicate token" }, { status: 401 });
  }
  if (!REPLICATE_KEY_PATTERN.test(token)) {
    return NextResponse.json({ error: "Invalid Replicate token format" }, { status: 401 });
  }

  const image = getString(body, "image");
  if (!image) {
    return NextResponse.json({ error: "Missing 'image' (data URL or hosted URL)" }, { status: 400 });
  }
  if (!image.startsWith("data:image/") && !/^https?:\/\//i.test(image)) {
    return NextResponse.json(
      { error: "'image' must be a data URL ('data:image/...') or http(s) URL" },
      { status: 400 },
    );
  }

  const promptRaw = getString(body, "prompt");
  const prompt = promptRaw && promptRaw.trim().length > 0 ? promptRaw.trim() : DEFAULT_PROMPT;
  const seed = getNumber(body, "seed");
  const modelRaw = body.model;
  const modelKey: ModelKey = isModelKey(modelRaw) ? modelRaw : "wan-fast";
  const spec = MODEL_REGISTRY[modelKey];

  const replicateUrl = `https://api.replicate.com/v1/models/${spec.owner}/${spec.name}/predictions`;
  const payload = { input: spec.buildInput(image, prompt, seed) };

  let upstream: Response;
  try {
    upstream = await fetch(replicateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=0",
      },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    return NextResponse.json({ error: `Replicate request failed: ${msg}` }, { status: 502 });
  }

  let upstreamJson: unknown;
  try {
    upstreamJson = await upstream.json();
  } catch {
    return NextResponse.json(
      { error: `Replicate returned non-JSON (HTTP ${upstream.status})` },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const errMsg =
      (upstreamJson && typeof upstreamJson === "object" && "detail" in upstreamJson
        ? String((upstreamJson as { detail?: unknown }).detail)
        : `Replicate error (HTTP ${upstream.status})`) || "Replicate error";
    return NextResponse.json({ error: errMsg }, { status: upstream.status });
  }

  if (!upstreamJson || typeof upstreamJson !== "object") {
    return NextResponse.json({ error: "Unexpected Replicate response" }, { status: 502 });
  }
  const obj = upstreamJson as Record<string, unknown>;
  const id = getString(obj, "id");
  const status = getString(obj, "status") ?? "starting";
  if (!id) {
    return NextResponse.json({ error: "Replicate response missing prediction id" }, { status: 502 });
  }

  return NextResponse.json({ id, status, model: modelKey });
}
