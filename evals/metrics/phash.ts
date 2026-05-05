import sharp from "sharp";
import type { MetricResult } from "../types";

/**
 * Perceptual Hash (pHash) 기반 시각 유사도.
 *
 * 알고리즘 (단순화 버전):
 *   1. 이미지를 32x32 그레이스케일로 축소
 *   2. 각 픽셀의 밝기 평균을 구함
 *   3. 평균보다 밝으면 1, 어두우면 0 → 1024비트 해시
 *   4. 두 해시 간 Hamming distance로 거리 측정
 *
 * 정규화: 1.0 = 동일, 0.0 = 완전히 반대.
 * 해석:
 *   - 0.95+ : 거의 동일 (같은 캐릭터)
 *   - 0.85-0.95 : 유사 (같은 캐릭터, 다른 포즈)
 *   - 0.70-0.85 : 의심스러움 (같은 캐릭터인지 애매)
 *   - <0.70 : 다른 캐릭터일 가능성 높음
 */
export async function phashMetric(
  seed: Buffer,
  variant: Buffer
): Promise<MetricResult> {
  const [a, b] = await Promise.all([phash(seed), phash(variant)]);
  const dist = hamming(a, b);
  const score = 1 - dist / a.length; // 0~1로 정규화
  return {
    metric: "phash",
    score,
    raw: dist,
    note: `Hamming distance: ${dist} / ${a.length} bits`,
  };
}

async function phash(buf: Buffer, size = 32): Promise<Uint8Array> {
  const { data } = await sharp(buf)
    .removeAlpha()
    .resize(size, size, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;

  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] > mean ? 1 : 0;
  }
  return out;
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d;
}
