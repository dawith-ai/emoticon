/**
 * POST /api/lora/train — Replicate flux-dev-lora-trainer thin proxy.
 *
 * 요청 흐름:
 *   1) 클라이언트가 사용자 Replicate 토큰 + 시드 ZIP URL 전달
 *   2) 서버는 토큰을 메모리에서만 사용해 Replicate 모델/학습 호출
 *   3) prediction id, status URL 반환 — 토큰은 응답에 절대 포함 X
 *
 * 보안:
 *   - 토큰은 헤더(Authorization: Token ...)로만 받고, 로그/저장 절대 금지
 *   - 환경변수 사용 X — 모든 토큰은 BYOK
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPLICATE_BASE = "https://api.replicate.com/v1";

type TrainBody = {
  /** Replicate 토큰 (헤더로 못 받았을 때만 fallback. 헤더 권장) */
  token?: string;
  /** zip 파일 다운로드 가능한 공개 URL (Firebase Storage 다운로드 URL 등) */
  inputImagesUrl?: string;
  /** 트리거 단어 (생성 프롬프트에서 캐릭터 호출용) */
  triggerWord?: string;
  /** 학습 step (default 1000) */
  steps?: number;
  /** 사용자가 학습 결과를 저장할 destination 모델 owner (예: "joe") */
  owner?: string;
};

type ReplicateModel = {
  url?: string;
  owner?: string;
  name?: string;
  latest_version?: { id?: string };
};

type ReplicateAccount = {
  username?: string;
  type?: string;
};

type ReplicatePrediction = {
  id?: string;
  status?: string;
  urls?: { get?: string; cancel?: string };
};

type ReplicateTraining = {
  id?: string;
  status?: string;
  urls?: { get?: string; cancel?: string };
};

type ReplicateError = { detail?: string; title?: string };

function readToken(req: Request, body: TrainBody): string | null {
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

function errorMessage(payload: ReplicateError | null, fallback: string): string {
  if (!payload) return fallback;
  return payload.detail ?? payload.title ?? fallback;
}

/** Replicate 계정의 username 조회 (destination owner 자동 설정용) */
async function getAccount(token: string): Promise<ReplicateAccount | null> {
  const res = await fetch(`${REPLICATE_BASE}/account`, {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return safeJson<ReplicateAccount>(res);
}

/** 사용자 계정에 destination 모델 생성 (이미 있으면 그대로 통과) */
async function ensureModel(
  token: string,
  owner: string,
  name: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const res = await fetch(`${REPLICATE_BASE}/models`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      owner,
      name,
      visibility: "private",
      hardware: "gpu-t4",
      description: "VibeMoji per-character LoRA (auto-created)",
    }),
  });
  if (res.ok) return { ok: true, status: res.status };
  // 409 = already exists → 정상
  if (res.status === 409 || res.status === 422) {
    const payload = await safeJson<ReplicateError>(res);
    const detail = (payload?.detail ?? "").toLowerCase();
    if (detail.includes("already") || detail.includes("exists")) {
      return { ok: true, status: res.status };
    }
  }
  const payload = await safeJson<ReplicateError>(res);
  return {
    ok: false,
    status: res.status,
    message: errorMessage(payload, `model create failed (${res.status})`),
  };
}

/** flux-dev-lora-trainer 의 최신 version id 조회 */
async function getTrainerVersion(token: string): Promise<string | null> {
  const res = await fetch(
    `${REPLICATE_BASE}/models/ostris/flux-dev-lora-trainer`,
    {
      headers: { Authorization: `Token ${token}` },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const data = await safeJson<ReplicateModel>(res);
  return data?.latest_version?.id ?? null;
}

export async function POST(req: Request) {
  let body: TrainBody;
  try {
    body = (await req.json()) as TrainBody;
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
  if (!body.inputImagesUrl || typeof body.inputImagesUrl !== "string") {
    return NextResponse.json(
      { success: false, error: "inputImagesUrl(zip 다운로드 URL)이 필요합니다." },
      { status: 400 },
    );
  }

  const triggerWord =
    typeof body.triggerWord === "string" && body.triggerWord.trim()
      ? body.triggerWord.trim()
      : "VBMOJI";
  const steps =
    typeof body.steps === "number" && Number.isFinite(body.steps)
      ? Math.max(100, Math.min(4000, Math.floor(body.steps)))
      : 1000;

  // 1) 계정에서 owner 추출 (또는 body.owner 우선)
  let owner = typeof body.owner === "string" ? body.owner.trim() : "";
  if (!owner) {
    const account = await getAccount(token);
    owner = account?.username ?? "";
  }
  if (!owner) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Replicate 계정 username을 가져올 수 없습니다. 토큰 권한을 확인해주세요.",
      },
      { status: 403 },
    );
  }

  // 2) destination 모델 생성 (없으면)
  const modelName = `vibemoji-${Date.now()}`;
  const ensured = await ensureModel(token, owner, modelName);
  if (!ensured.ok) {
    return NextResponse.json(
      { success: false, error: ensured.message ?? "모델 생성 실패" },
      { status: ensured.status || 500 },
    );
  }

  // 3) trainer version id 조회
  const versionId = await getTrainerVersion(token);
  if (!versionId) {
    return NextResponse.json(
      {
        success: false,
        error: "flux-dev-lora-trainer 버전 정보를 가져오지 못했습니다.",
      },
      { status: 502 },
    );
  }

  // 4) 학습 trigger
  const trainRes = await fetch(
    `${REPLICATE_BASE}/models/ostris/flux-dev-lora-trainer/versions/${versionId}/trainings`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=0",
      },
      body: JSON.stringify({
        destination: `${owner}/${modelName}`,
        input: {
          input_images: body.inputImagesUrl,
          trigger_word: triggerWord,
          steps,
          lora_rank: 16,
          optimizer: "adamw8bit",
          learning_rate: 0.0004,
          resolution: "512,768,1024",
          batch_size: 1,
          autocaption: true,
        },
      }),
    },
  );

  if (!trainRes.ok) {
    const payload = await safeJson<ReplicateError>(trainRes);
    return NextResponse.json(
      {
        success: false,
        error: errorMessage(payload, `학습 시작 실패 (${trainRes.status})`),
      },
      { status: trainRes.status },
    );
  }

  const training = await safeJson<ReplicateTraining>(trainRes);
  if (!training?.id) {
    return NextResponse.json(
      { success: false, error: "학습 응답이 비어있습니다." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      trainingId: training.id,
      status: training.status ?? "starting",
      statusUrl: training.urls?.get ?? null,
      destination: `${owner}/${modelName}`,
      triggerWord,
      steps,
    },
  });
}

// 안전을 위한 GET noop — 잘못된 메서드 안내
export async function GET() {
  return NextResponse.json(
    { success: false, error: "POST 만 지원합니다." },
    { status: 405 },
  );
}

export type LoraTrainResponse = {
  success: boolean;
  data?: {
    trainingId: string;
    status: string;
    statusUrl: string | null;
    destination: string;
    triggerWord: string;
    steps: number;
  };
  error?: string;
};

// 정적 export 빌드 시 라우트 무시
export const fetchCache = "force-no-store";

// 사용되지 않음 — 빌드 분류 회피용 noop
const _unused: ReplicatePrediction = { id: undefined };
void _unused;
