/**
 * 단순 RPM(분당 호출 수) 제어용 throttle.
 *
 * Gemini 무료 티어는 분당 10회 한도가 일반적 — 6초 간격으로 호출하면 안전.
 * Pollinations도 명시적 한도 없지만 동시 폭발 방지용으로 1초 간격 권장.
 */
export class Throttle {
  private last = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs: number) {
    this.minIntervalMs = Math.max(0, minIntervalMs);
  }

  /** 마지막 호출 후 minInterval 미만이면 그만큼 대기 */
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.last;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.last = Date.now();
  }

  setInterval(ms: number) {
    this.minIntervalMs = Math.max(0, ms);
  }
}

/** Gemini 무료 티어 권장 — 6.5초 (안전 마진) */
export const GEMINI_FREE_INTERVAL_MS = 6500;
/** Pollinations — 1초 (사용량 분산) */
export const POLLINATIONS_INTERVAL_MS = 1000;
