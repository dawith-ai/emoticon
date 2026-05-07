/**
 * PNG 자동 압축 — 카카오 ≤150KB 사양을 만족시키기 위한 점진적 양자화.
 *
 * PNG는 lossless 포맷이라 quality 다이얼이 없고, 대신 색상/알파를 양자화해서
 * 인코더 필터/zlib 압축률을 높이는 방식으로 파일 크기를 줄인다.
 *
 * 단계별 전략:
 *   Level 0  원본
 *   Level 1+ RGB 비트 양자화 (8→7→6→5→4→3→2→1비트)
 *   동시에   알파 임계화로 반투명 안티앨리어싱 노이즈 제거
 *
 * 카카오 360×360 이모티콘 기준 보통 Level 2-3에서 ≤150KB 도달.
 */
import { canvasToPng } from "./resize";

export type CompressResult = {
  blob: Blob;
  /** 적용된 압축 레벨 (0=원본) */
  level: number;
  /** RGB 각 채널 양자화 비트 (8=원본) */
  rgbBits: number;
  /** 알파 임계값 (0=양자화 없음) */
  alphaThreshold: number;
  /** 시도 횟수 */
  attempts: number;
  /** 목표 크기 만족 여부 */
  satisfied: boolean;
};

type Step = { quantize: number; alphaT: number };

const STEPS: Step[] = [
  { quantize: 0, alphaT: 0 }, // 원본
  { quantize: 1, alphaT: 0 }, // 7비트 (128단계)
  { quantize: 2, alphaT: 16 }, // 6비트 + 미세 알파 노이즈 제거
  { quantize: 3, alphaT: 32 }, // 5비트
  { quantize: 4, alphaT: 48 }, // 4비트 (16단계, 픽셀아트 톤)
  { quantize: 5, alphaT: 64 }, // 3비트
  { quantize: 6, alphaT: 128 }, // 2비트
  { quantize: 7, alphaT: 200 }, // 1비트 (사실상 단색 + 1비트 알파)
];

export async function compressPngTo(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<CompressResult> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");

  const original = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let attempts = 0;
  let last: CompressResult | null = null;

  for (let i = 0; i < STEPS.length; i++) {
    attempts++;
    const { quantize, alphaT } = STEPS[i];

    // 새 ImageData 복사 후 양자화 적용
    const work = ctx.createImageData(canvas.width, canvas.height);
    work.data.set(original.data);
    if (quantize > 0 || alphaT > 0) {
      const data = work.data;
      const mask = quantize > 0 ? (0xff << quantize) & 0xff : 0xff;
      const halfStep = quantize > 0 ? 1 << (quantize - 1) : 0;
      for (let p = 0; p < data.length; p += 4) {
        if (quantize > 0) {
          // 비트 양자화 + 라운딩 (절반값 더해서 가까운 양자값으로)
          data[p] = Math.min(255, (data[p] & mask) + halfStep);
          data[p + 1] = Math.min(255, (data[p + 1] & mask) + halfStep);
          data[p + 2] = Math.min(255, (data[p + 2] & mask) + halfStep);
        }
        if (alphaT > 0) {
          data[p + 3] = data[p + 3] >= alphaT ? 255 : 0;
        }
      }
    }

    ctx.putImageData(work, 0, 0);
    const blob = await canvasToPng(canvas);
    const result: CompressResult = {
      blob,
      level: i,
      rgbBits: 8 - quantize,
      alphaThreshold: alphaT,
      attempts,
      satisfied: blob.size <= maxBytes,
    };
    last = result;
    if (result.satisfied) break;
  }

  // 캔버스 원본 복원 (호출자에 부작용 안 남기도록)
  ctx.putImageData(original, 0, 0);

  return last!;
}

export const KAKAO_STATIC_MAX_BYTES = 150 * 1024;
export const KAKAO_ANIMATED_MAX_BYTES = 650 * 1024;
