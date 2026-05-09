/**
 * GET /api/animate/status?id=<prediction_id>
 *
 * Replicate prediction의 현재 상태/결과를 조회한다.
 * 토큰은 Authorization 헤더(Bearer ...) 또는 ?token= 쿼리로 받는다.
 *
 * Response:
 *   200 → {
 *     id: string,
 *     status: 'starting'|'processing'|'succeeded'|'failed'|'canceled',
 *     videoUrl: string | null,   // succeeded일 때 MP4 URL
 *     progress: number | null,   // 0~1 (Replicate가 logs로 줄 때만)
 *     error: string | null
 *   }
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPLICATE_KEY_PATTERN = /^r8_[A-Za-z0-9]{36,}$/;

function extractToken(req: Request, url: URL): string | undefined {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const q = url.searchParams.get("token");
  return q?.trim() || undefined;
}

function pickVideoUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === "string") return item;
    }
    return null;
  }
  if (output && typeof output === "object") {
    // 일부 모델은 {video: "..."} 또는 {url: "..."} 형태
    const obj = output as Record<string, unknown>;
    for (const k of ["video", "url", "mp4", "output"]) {
      const v = obj[k];
      if (typeof v === "string") return v;
      if (Array.isArray(v)) {
        for (const item of v) if (typeof item === "string") return item;
      }
    }
  }
  return null;
}

/** Replicate logs 텍스트에서 진행률을 추정 (0~1). 모델이 표준 포맷을 안 줘서 best-effort. */
function pickProgress(logs: unknown): number | null {
  if (typeof logs !== "string" || logs.length === 0) return null;
  // "X% complete" 또는 "step N/M" 형태를 휴리스틱으로 파싱
  const pct = logs.match(/(\d{1,3})\s*%/g);
  if (pct && pct.length > 0) {
    const last = pct[pct.length - 1];
    const n = Number(last.replace(/[^0-9]/g, ""));
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n / 100));
  }
  const step = logs.match(/(\d+)\s*\/\s*(\d+)/g);
  if (step && step.length > 0) {
    const last = step[step.length - 1];
    const m = last.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && b > 0) {
        return Math.max(0, Math.min(1, a / b));
      }
    }
  }
  return null;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing 'id'" }, { status: 400 });
  }

  const token = extractToken(req, url);
  if (!token) {
    return NextResponse.json({ error: "Missing Replicate token" }, { status: 401 });
  }
  if (!REPLICATE_KEY_PATTERN.test(token)) {
    return NextResponse.json({ error: "Invalid Replicate token format" }, { status: 401 });
  }

  const replicateUrl = `https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`;

  let upstream: Response;
  try {
    upstream = await fetch(replicateUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
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
      upstreamJson && typeof upstreamJson === "object" && "detail" in upstreamJson
        ? String((upstreamJson as { detail?: unknown }).detail)
        : `Replicate error (HTTP ${upstream.status})`;
    return NextResponse.json({ error: errMsg }, { status: upstream.status });
  }

  if (!upstreamJson || typeof upstreamJson !== "object") {
    return NextResponse.json({ error: "Unexpected Replicate response" }, { status: 502 });
  }

  const obj = upstreamJson as Record<string, unknown>;
  const status = typeof obj.status === "string" ? obj.status : "unknown";
  const videoUrl = status === "succeeded" ? pickVideoUrl(obj.output) : null;
  const progress = pickProgress(obj.logs);
  const errorVal = obj.error;
  const error = typeof errorVal === "string" ? errorVal : null;

  return NextResponse.json({
    id,
    status,
    videoUrl,
    progress,
    error,
  });
}
