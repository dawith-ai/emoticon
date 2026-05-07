/**
 * BYOK (Bring Your Own Key) — 사용자 본인 Gemini API 키를 localStorage에 보관.
 *
 * 보안 원칙:
 * - 키는 사용자 브라우저 localStorage에만 저장 (서버/Firestore에 영구 보관 안 함)
 * - Cloud Function 호출 시에만 페이로드로 전달 (HTTPS, 서버는 메모리에서만 사용)
 * - 화면 표시는 항상 마스킹 (앞 6자 + 끝 4자만 노출)
 * - 약관 동의 후 저장 (사용자가 명시적으로 옵트인)
 */

const STORAGE_KEY = "vibemoji.byok.gemini";
const CONSENT_KEY = "vibemoji.byok.consent";

export type ByokState = {
  /** 저장된 키 (없으면 빈 문자열) */
  key: string;
  /** 사용자가 약관에 동의했는지 */
  consented: boolean;
};

export function getByok(): ByokState {
  if (typeof window === "undefined") return { key: "", consented: false };
  return {
    key: window.localStorage.getItem(STORAGE_KEY) ?? "",
    consented: window.localStorage.getItem(CONSENT_KEY) === "1",
  };
}

export function setByok(key: string, consented: boolean) {
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

export function clearByok() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(CONSENT_KEY);
}

/** Google AI Studio 키 형식 검증 (앞 4자 AIza + 30자 이상 영숫자/-/_) */
export function isValidGeminiKey(key: string): boolean {
  return /^AIza[A-Za-z0-9_-]{30,}$/.test(key.trim());
}

/** 화면 노출용 마스킹: AIza1234...wxyz */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 12) return k.replace(/./g, "•");
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/** 호출 시 사용 가능한 BYOK 키 — 형식 검증 + 동의 둘 다 필요. 아니면 undefined */
export function getActiveByokKey(): string | undefined {
  const { key, consented } = getByok();
  if (!consented) return undefined;
  if (!isValidGeminiKey(key)) return undefined;
  return key;
}
