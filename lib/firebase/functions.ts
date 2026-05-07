import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { getClientFunctions } from "./client";

/**
 * Cloud Functions HTTPS Callable 안전 래퍼.
 *
 * - Firebase 미설정 시 `null` 반환 (UI는 "환경 설정 필요" 표시)
 * - 호출 결과 데이터 타입 강제
 * - 에러 객체 정규화
 */
export type CallableResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export async function callFunction<TReq, TRes>(
  name: string,
  payload: TReq
): Promise<CallableResult<TRes>> {
  const fns = getClientFunctions();
  if (!fns) {
    return { ok: false, error: "Firebase 클라이언트가 설정되지 않았어요." };
  }
  try {
    const callable = httpsCallable<TReq, TRes>(fns, name);
    const result: HttpsCallableResult<TRes> = await callable(payload);
    return { ok: true, data: result.data };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return {
      ok: false,
      error: e?.message ?? "Functions 호출 실패",
      code: e?.code,
    };
  }
}

// ─────────────────────────────────────────────────────────
// 도메인별 타입 정의
// ─────────────────────────────────────────────────────────

export type GenerateSeedReq = {
  projectId: string;
  characterDescription: string;
  /** BYOK — 사용자 본인 Gemini 키. 있으면 크레딧 차감 안 함. */
  byokApiKey?: string;
};
export type GenerateSeedRes = { ok: boolean; seedPath: string; byok?: boolean };

export type GenerateSetReq = {
  projectId: string;
  emotions: Array<{ slot: number; label: string; action: string }>;
  /** BYOK — 본인 키로 호출 시 크레딧 차감 없음 */
  byokApiKey?: string;
};
export type GenerateSetRes = {
  ok: boolean;
  successCount: number;
  byok?: boolean;
  results: Array<{
    slot: number;
    ok: boolean;
    path?: string;
    error?: string;
  }>;
};

export type PackagePlatformReq = {
  projectId: string;
  platform: "kakao" | "ogq" | "line" | "etsy";
};
export type PackagePlatformRes = { ok: boolean; url: string; fileCount: number };

export const generateSeedCharacter = (req: GenerateSeedReq) =>
  callFunction<GenerateSeedReq, GenerateSeedRes>("generateSeedCharacter", req);

export const generateStickerSet = (req: GenerateSetReq) =>
  callFunction<GenerateSetReq, GenerateSetRes>("generateStickerSet", req);

export const packagePlatform = (req: PackagePlatformReq) =>
  callFunction<PackagePlatformReq, PackagePlatformRes>("packagePlatform", req);
