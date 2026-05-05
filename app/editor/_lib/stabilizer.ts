/**
 * 손떨림 보정 (Stabilizer).
 *
 * 이비스페인트의 핵심 보조 기능 — 손이 떨려도 라인이 매끈하게 나오게 만듦.
 * 알고리즘: Pull-string 방식 (포인터가 끄는 줄 끝에 펜이 따라옴)
 *
 * level 0: 보정 없음 (raw 입력)
 * level 1-5: 줄 길이가 점점 길어져서 더 부드럽게 / 응답 느림
 */
export class Stabilizer {
  private buffer: Array<{ x: number; y: number }> = [];
  private level: number;

  constructor(level: number) {
    this.level = Math.max(0, Math.min(5, level));
  }

  setLevel(level: number) {
    this.level = Math.max(0, Math.min(5, level));
  }

  reset() {
    this.buffer = [];
  }

  /**
   * 새 포인트 입력 → 보정된 포인트 반환.
   * level=0이면 그대로 반환.
   */
  push(p: { x: number; y: number }): { x: number; y: number } {
    if (this.level === 0) return p;

    this.buffer.push(p);
    const windowSize = this.level * 2 + 1; // 3, 5, 7, 9, 11
    if (this.buffer.length > windowSize) {
      this.buffer.shift();
    }

    // 단순 이동 평균 (충분히 좋음)
    let sx = 0,
      sy = 0;
    for (const b of this.buffer) {
      sx += b.x;
      sy += b.y;
    }
    return { x: sx / this.buffer.length, y: sy / this.buffer.length };
  }
}
