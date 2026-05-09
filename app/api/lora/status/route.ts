/**
 * GET /api/lora/status?id=<trainingId>
 *
 * Replicate training/prediction 상태 조회. 토큰은 헤더(Authorization: Token ...) 권장.
 * 응답: { status, progress, output (LoRA weights URL), logs (tail), error }
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPLICATE_BASE = "https://api.replicate.com/v1";

type ReplicateTraining = {
  id?: string;
  status?: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | { weights?: string } | null;
  error?: string | null;
  logs?: string | null;
  metrics?: { predict_time?: number };
  urls?: { get?: string };
  version?: string;
};

function readToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth) {
    const match = auth.match(/^(?:Token|Bearer)\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  // 마지막 fallback: query string ?token=... (보안상 비권장이라 절대 로깅 X)
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery.trim();
  return null;
}

function isValidToken(token: string): boolean {
  return /^r8_[A-Za-z0-9]{36,}$/.test(token);
}

/** training URL이 가장 안정적이지만, id만 있으면 trainings 엔드포인트로 조회 */
async function fetchTraining(
  token: string,
  id: string,
): Promise<{ ok: boolean; status: number; data?: ReplicateTraining; message?: string }> {
  const res = await fetch(`${REPLICATE_BASE}/trainings/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `상태 조회 실패 (${res.status})`;
    try {
      const payload = (await res.json()) as { detail?: string };
      if (payload?.detail) detail = payload.detail;
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, message: detail };
  }
  let data: ReplicateTraining;
  try {
    data = (await res.json()) as ReplicateTraining;
  } catch {
    return { ok: false, status: 502, message: "응답 파싱 실패" };
  }
  return { ok: true, status: 200, data };
}

/** logs에서 step 진행률 대략 추정. flux-dev-lora-trainer 로그는 "step 32/1000" 비슷한 패턴 사용. */
function estimateProgress(status: string | undefined, logs: string | null | undefined): number {
  if (status === "succeeded") return 1;
  if (status === "failed" || status === "canceled") return 0;
  if (!logs) return status === "processing" ? 0.05 : 0.01;
  const matches = Array.from(logs.matchAll(/(\d+)\s*\/\s*(\d+)/g));
  if (matches.length === 0) return status === "processing" ? 0.1 : 0.02;
  const last = matches[matches.length - 1];
  const cur = Number(last[1]);
  const total = Number(last[2]);
  if (!Number.isFinite(cur) || !Number.isFinite(total) || total <= 0) return 0.1;
  return Math.min(0.99, Math.max(0.02, cur / total));
}

function extractWeights(output: ReplicateTraining["output"]): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (typeof output === "object" && typeof output.weights === "string") {
    return output.weights;
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "id 쿼리 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const token = readToken(req);
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

  const result = await fetchTraining(token, id);
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { success: false, error: result.message ?? "상태 조회 실패" },
      { status: result.status || 500 },
    );
  }

  const data = result.data;
  const status = data.status ?? "starting";
  const progress = estimateProgress(status, data.logs ?? null);
  const weights = extractWeights(data.output ?? null);
  const logsTail = (data.logs ?? "").split("\n").slice(-12).join("\n");

  return NextResponse.json({
    success: true,
    data: {
      id: data.id ?? id,
      status,
      progress,
      weights,
      logsTail,
      error: data.error ?? null,
      version: data.version ?? null,
    },
  });
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: "GET 만 지원합니다." },
    { status: 405 },
  );
}

export type LoraStatusResponse = {
  success: boolean;
  data?: {
    id: string;
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled" | string;
    progress: number;
    weights: string | null;
    logsTail: string;
    error: string | null;
    version: string | null;
  };
  error?: string;
};
