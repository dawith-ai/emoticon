/**
 * 알파 마스크 기반 흰색 테두리 생성
 * — 캔버스 알파 채널을 두께만큼 팽창시켜 흰색으로 채우고 원본을 위에 합성한다.
 *
 * 두 패스 거리 변환(2-pass squared euclidean distance)으로 O(W·H) 처리.
 * 큰 이미지(2000px+)에서도 즉시 동작.
 */

export type OutlineRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OutlineOptions = {
  /** 테두리 두께(px). 1 이상 정수 권장 */
  thickness: number;
  /** 알파 임계값(0-255). 이보다 알파가 작으면 빈 픽셀로 본다 */
  alphaThreshold?: number;
  /** 테두리 색 (기본 흰색) */
  color?: { r: number; g: number; b: number; a?: number };
  /** 추적 영역(이 안의 알파만 팽창) — 없으면 전체 */
  region?: OutlineRegion;
};

/**
 * 1D 거리 변환 (Felzenszwalb & Huttenlocher 알고리즘 기반).
 * f[i]가 0이면 "씨앗"으로 간주 — 출력 d[i]는 가장 가까운 씨앗까지의 제곱 거리.
 *
 * 표준 알고리즘은 모든 f[i]가 유한하다고 가정. 우리 도구는 알파 마스크 기반
 * 이라 INF가 흔하므로(빈 픽셀), INF는 "거기에 포물선이 없다"로 간주해 스킵한다.
 * 모든 점이 INF면 출력도 모두 INF.
 */
export function distanceTransform1D(f: Float64Array, n: number, out: Float64Array) {
  // 첫 유한 씨앗 찾기 — 없으면 전체를 INF로 채우고 종료
  let firstSeed = -1;
  for (let q = 0; q < n; q++) {
    if (f[q] !== Infinity) {
      firstSeed = q;
      break;
    }
  }
  if (firstSeed === -1) {
    for (let q = 0; q < n; q++) out[q] = Infinity;
    return;
  }

  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = firstSeed;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = firstSeed + 1; q < n; q++) {
    if (f[q] === Infinity) continue; // INF 위치엔 포물선이 없음
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    out[q] = dq * dq + f[v[k]];
  }
}

/**
 * 알파 채널을 기반으로 한 squared euclidean distance map을 만든다.
 * 출력은 W*H 크기의 Float64Array이고, 값은 가장 가까운 불투명 픽셀까지의 제곱 거리.
 */
export function buildDistanceMap(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  region: OutlineRegion,
): Float64Array {
  const INF = Number.POSITIVE_INFINITY;
  const total = width * height;
  const f = new Float64Array(total);

  // 초기값: 영역 내 알파 >= threshold 인 픽셀은 0(씨앗), 나머지는 INF
  for (let y = 0; y < height; y++) {
    const inY = y >= region.y && y < region.y + region.h;
    for (let x = 0; x < width; x++) {
      const inX = x >= region.x && x < region.x + region.w;
      const idx = y * width + x;
      if (inY && inX && data[idx * 4 + 3] >= threshold) {
        f[idx] = 0;
      } else {
        f[idx] = INF;
      }
    }
  }

  // 1단계: 각 열에 대해 1D DT
  const colIn = new Float64Array(height);
  const colOut = new Float64Array(height);
  const tmp = new Float64Array(total);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) colIn[y] = f[y * width + x];
    distanceTransform1D(colIn, height, colOut);
    for (let y = 0; y < height; y++) tmp[y * width + x] = colOut[y];
  }

  // 2단계: 각 행에 대해 1D DT
  const rowIn = new Float64Array(width);
  const rowOut = new Float64Array(width);
  const out = new Float64Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rowIn[x] = tmp[y * width + x];
    distanceTransform1D(rowIn, width, rowOut);
    for (let x = 0; x < width; x++) out[y * width + x] = rowOut[x];
  }
  return out;
}

/**
 * 원본 PNG에 흰색 테두리를 합성한 새 캔버스를 반환.
 *
 * 알고리즘
 *   1. 거리 변환으로 가장 가까운 불투명 픽셀까지 거리 d 계산
 *   2. d <= thickness 인 픽셀을 테두리(흰색)로 칠함
 *   3. 거리 0~1 픽셀은 안티앨리어싱 마스크 적용(가장자리 부드럽게)
 *   4. 원본을 위에 합성
 */
export function applyOutline(
  source: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number },
  opts: OutlineOptions,
): HTMLCanvasElement {
  const w =
    (source as HTMLImageElement).naturalWidth ||
    (source as HTMLCanvasElement).width ||
    0;
  const h =
    (source as HTMLImageElement).naturalHeight ||
    (source as HTMLCanvasElement).height ||
    0;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return out;

  // 원본 → 임시 캔버스
  ctx.drawImage(source, 0, 0, w, h);
  const baseImage = ctx.getImageData(0, 0, w, h);

  const thickness = Math.max(1, Math.round(opts.thickness));
  const threshold = opts.alphaThreshold ?? 16;
  const region: OutlineRegion = opts.region ?? { x: 0, y: 0, w, h };
  const color = opts.color ?? { r: 255, g: 255, b: 255, a: 255 };

  const distSq = buildDistanceMap(baseImage.data, w, h, threshold, region);

  // 거리 마스크를 PNG로 그릴 ImageData 만들기
  const outline = ctx.createImageData(w, h);
  const t = thickness;
  const tInner = Math.max(0, t - 1);
  for (let i = 0; i < w * h; i++) {
    const d = Math.sqrt(distSq[i]);
    if (d > t) continue;
    let alpha: number;
    if (d <= tInner) {
      alpha = 1;
    } else {
      alpha = 1 - (d - tInner) / (t - tInner || 1);
    }
    const a8 = Math.round((color.a ?? 255) * alpha);
    if (a8 <= 0) continue;
    const idx = i * 4;
    outline.data[idx] = color.r;
    outline.data[idx + 1] = color.g;
    outline.data[idx + 2] = color.b;
    outline.data[idx + 3] = a8;
  }

  // 합성: 테두리 먼저 → 원본 위에
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(outline, 0, 0);
  // 원본 다시 그리기 (drawImage가 source-over 기본)
  ctx.drawImage(source, 0, 0, w, h);
  return out;
}
