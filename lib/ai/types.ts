/**
 * 클라이언트 사이드 AI 이미지 생성 어댑터 — 공통 타입.
 *
 * 모든 generator는 브라우저에서 직접 호출 (Cloud Functions 불필요).
 * Blob 단위로 입출력 통일 — generate 페이지/에디터/사이즈 변환기 모두 그대로 받아 처리.
 */

export type AIProviderId = "mock" | "pollinations" | "gemini";

export type GenerationInput = {
  /** 영문 프롬프트 (모델은 영문에 최적화돼 있음) */
  prompt: string;
  /** 캔버스 폭/높이 (기본 512) */
  width?: number;
  height?: number;
  /** 재현성용 시드 (Pollinations 등에서 의미 있음) */
  seed?: number;
  /** 캐릭터 일관성용 참고 이미지 — Gemini만 활용 */
  referenceBlob?: Blob;
  /** 호출 추적용 (로그 출력 등) */
  label?: string;
};

export type GenerationCost = {
  /** 1회 호출당 USD 추정 */
  perCall: number;
  /** 무료 티어 안내 */
  freeNote?: string;
};

export interface AIGenerator {
  readonly id: AIProviderId;
  readonly label: string;
  readonly description: string;
  readonly cost: GenerationCost;
  /** 캐릭터 일관성을 위한 reference image 지원 여부 */
  readonly supportsReference: boolean;
  /** 운영자 키/사용자 키/없음 어느 쪽인지 */
  readonly auth: "none" | "byok-required";
  /** 사용 가능한 상태인지 (BYOK 키 등 환경 검증) */
  isReady(): boolean;
  /** 1장 생성 */
  generate(input: GenerationInput): Promise<Blob>;
}

/** Blob → base64 (data: prefix 제외) */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** base64 → Blob */
export function base64ToBlob(b64: string, mimeType = "image/png"): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
