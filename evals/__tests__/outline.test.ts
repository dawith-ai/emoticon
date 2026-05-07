import { describe, expect, it } from "vitest";
import {
  distanceTransform1D,
  buildDistanceMap,
} from "../../app/tools/_lib/outline";

const INF = Number.POSITIVE_INFINITY;

function dt1d(arr: number[]): number[] {
  const f = Float64Array.from(arr);
  const out = new Float64Array(arr.length);
  distanceTransform1D(f, arr.length, out);
  return Array.from(out);
}

describe("outline / distanceTransform1D", () => {
  it("씨앗이 양 끝에 있으면 가운데로 갈수록 거리² 가 증가한다", () => {
    // 씨앗(0) at 0, 4 → 거리² = [0,1,4,1,0]
    expect(dt1d([0, INF, INF, INF, 0])).toEqual([0, 1, 4, 1, 0]);
  });

  it("씨앗이 가운데 있으면 양쪽으로 거리² 가 대칭 증가한다", () => {
    expect(dt1d([INF, INF, 0, INF, INF])).toEqual([4, 1, 0, 1, 4]);
  });

  it("모든 점이 씨앗이면 거리² 는 모두 0이다", () => {
    expect(dt1d([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
  });

  it("씨앗이 하나도 없으면 거리² 는 모두 무한대로 유지된다", () => {
    const result = dt1d([INF, INF, INF]);
    expect(result.every((d) => d === INF)).toBe(true);
  });

  it("씨앗이 한 개이면 거리² 는 (i - seed)^2 와 일치한다", () => {
    const arr = [INF, INF, INF, 0, INF, INF, INF];
    const expected = arr.map((_, i) => (i - 3) ** 2);
    expect(dt1d(arr)).toEqual(expected);
  });
});

describe("outline / buildDistanceMap (2-pass 2D)", () => {
  /** w×h 알파 마스크를 RGBA Uint8ClampedArray로 만든다. mask[y*w+x] 가 truthy면 alpha=255 */
  function makeMask(w: number, h: number, mask: number[]): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4 + 3] = mask[i] ? 255 : 0;
    }
    return data;
  }

  it("중앙에 점 하나면 사방으로 정확한 유클리디안 제곱거리를 계산한다", () => {
    // 5×5 그리드, 중앙(2,2)에 점 하나
    const w = 5;
    const h = 5;
    const mask = [
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ];
    const data = makeMask(w, h, mask);
    const out = buildDistanceMap(data, w, h, 1, { x: 0, y: 0, w, h });
    // (0,0) → (2,2) 거리² = 8
    expect(out[0]).toBe(8);
    // (2,2) → 자기자신 = 0
    expect(out[2 * w + 2]).toBe(0);
    // (2,1) → (2,2) = 1
    expect(out[1 * w + 2]).toBe(1);
    // (4,4) → (2,2) = 8
    expect(out[4 * w + 4]).toBe(8);
  });

  it("전체가 빈 픽셀이면 결과는 전부 무한대", () => {
    const w = 3;
    const h = 3;
    const data = makeMask(w, h, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const out = buildDistanceMap(data, w, h, 1, { x: 0, y: 0, w, h });
    expect([...out].every((d) => d === INF)).toBe(true);
  });

  it("region 바깥의 픽셀은 씨앗으로 인식되지 않는다", () => {
    const w = 5;
    const h = 1;
    // 픽셀 (0,0)에만 알파, region은 (2,0)~(4,0)만 추적
    const data = makeMask(w, h, [1, 0, 0, 0, 0]);
    const out = buildDistanceMap(data, w, h, 1, { x: 2, y: 0, w: 3, h: 1 });
    // 모든 좌표에서 region 안의 씨앗 = 없음 → INF
    expect([...out].every((d) => d === INF)).toBe(true);
  });

  it("알파 임계값보다 낮은 픽셀은 씨앗에서 제외된다", () => {
    const w = 3;
    const h = 1;
    const data = new Uint8ClampedArray(w * h * 4);
    // (0,0) alpha=10 (임계 미만), (2,0) alpha=255 (씨앗)
    data[0 * 4 + 3] = 10;
    data[2 * 4 + 3] = 255;
    const out = buildDistanceMap(data, w, h, 16, { x: 0, y: 0, w, h });
    // (0,0)에서 (2,0)까지 거리² = 4
    expect(out[0]).toBe(4);
    // (2,0)는 씨앗 자기자신
    expect(out[2]).toBe(0);
  });
});
