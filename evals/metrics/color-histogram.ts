import sharp from "sharp";
import type { MetricResult } from "../types";

/**
 * 색상 히스토그램 거리 (RGB 4-bin 양자화).
 *
 * 캐릭터 일관성에서 가장 빠르게 깨지는 게 "주 색상"이라
 * 색상 분포만 따로 잡아내는 메트릭이 유용함.
 *
 * 알고리즘:
 *   1. 이미지를 64x64로 축소
 *   2. 각 채널을 4단계로 양자화 (4*4*4 = 64 bin)
 *   3. 정규화된 히스토그램 두 개의 Bhattacharyya 거리 계산
 *
 * 정규화: 1.0 = 동일, 0.0 = 완전히 다른 색 분포.
 * 해석:
 *   - 0.90+ : 색상 거의 동일
 *   - 0.75-0.90 : 미묘한 색 변화 (수용 가능)
 *   - <0.75 : 주 색상이 바뀜 (캐릭터 정체성 손상)
 */
export async function colorHistogramMetric(
  seed: Buffer,
  variant: Buffer
): Promise<MetricResult> {
  const [a, b] = await Promise.all([histogram(seed), histogram(variant)]);
  const bhatt = bhattacharyyaDistance(a, b);
  const score = 1 - Math.min(1, bhatt);
  return {
    metric: "color-histogram",
    score,
    raw: bhatt,
    note: `Bhattacharyya distance: ${bhatt.toFixed(4)}`,
  };
}

async function histogram(buf: Buffer, size = 64): Promise<number[]> {
  const { data, info } = await sharp(buf)
    .removeAlpha()
    .resize(size, size, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bins = 4;
  const hist = new Array(bins * bins * bins).fill(0);
  const channels = info.channels;
  const total = info.width * info.height;

  for (let i = 0; i < data.length; i += channels) {
    const r = Math.floor((data[i] / 256) * bins);
    const g = Math.floor((data[i + 1] / 256) * bins);
    const b = Math.floor((data[i + 2] / 256) * bins);
    hist[r * bins * bins + g * bins + b]++;
  }
  for (let i = 0; i < hist.length; i++) hist[i] /= total;
  return hist;
}

function bhattacharyyaDistance(a: number[], b: number[]): number {
  let bc = 0;
  for (let i = 0; i < a.length; i++) bc += Math.sqrt(a[i] * b[i]);
  bc = Math.min(1, bc); // 부동소수 오차 보정
  return Math.sqrt(1 - bc);
}
