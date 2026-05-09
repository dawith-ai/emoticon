/**
 * BYOK Replicate — 사용자 본인 Replicate API 토큰을 localStorage에 보관.
 *
 * Gemini BYOK와 동일 보안 모델: 키는 브라우저에만, 약관 동의 필요, 마스킹 노출.
 * 단 Replicate는 CORS 미지원 엔드포인트가 있어 Next.js API 라우트를 thin-proxy로 사용.
 * 서버는 키를 저장하지 않고 요청 헤더로만 받아 Replicate에 전달한다.
 */

const STORAGE_KEY = "vibemoji.byok.replicate";
const CONSENT_KEY = "vibemoji.byok.replicate.consent";

export type ReplicateByokState = {
  key: string;
  consented: boolean;
};

export function getReplicateByok(): ReplicateByokState {
  if (typeof window === "undefined") return { key: "", consented: false };
  return {
    key: window.localStorage.getItem(STORAGE_KEY) ?? "",
    consented: window.localStorage.getItem(CONSENT_KEY) === "1",
  };
}

export function setReplicateByok(key: string, consented: boolean) {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (trimmed) {
    window.localStorage.setItem(STORAGE_KEY, trimmed);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  if (consented) {
    window.localStorage.setItem(CONSENT_KEY, "1");
  } else {
    window.localStorage.removeItem(CONSENT_KEY);
  }
}

export function clearReplicateByok() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(CONSENT_KEY);
}

/** Replicate 토큰 형식: "r8_" + 영숫자 36자 이상 */
export function isValidReplicateKey(key: string): boolean {
  return /^r8_[A-Za-z0-9]{36,}$/.test(key.trim());
}

export function maskReplicateKey(key: string): string {
  const k = key.trim();
  if (k.length <= 12) return k.replace(/./g, "•");
  return `${k.slice(0, 5)}…${k.slice(-4)}`;
}

export function getActiveReplicateKey(): string | undefined {
  const { key, consented } = getReplicateByok();
  if (!consented) return undefined;
  if (!isValidReplicateKey(key)) return undefined;
  return key;
}
