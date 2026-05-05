import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { phashMetric } from "../metrics/phash";
import { colorHistogramMetric } from "../metrics/color-histogram";
import { aggregate } from "../metrics/aggregate";
import { MockGenerator } from "../runners/mock";
import { loadCharacters, loadEmotions } from "../datasets/load";

async function solidColor(r: number, g: number, b: number, size = 64) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
}

async function patternImage(seed: number, size = 64) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="white"/>
    <circle cx="${seed % size}" cy="${(seed * 7) % size}" r="${size / 4}" fill="black"/>
    <rect x="${(seed * 3) % size}" y="${(seed * 11) % size}" width="${size / 3}" height="${size / 3}" fill="gray"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("phash 메트릭", () => {
  it("동일한 이미지는 점수 1.0에 가까움", async () => {
    const a = await solidColor(180, 100, 100);
    const r = await phashMetric(a, a);
    expect(r.score).toBeGreaterThanOrEqual(0.99);
  });

  it("구조가 다른 패턴 이미지는 점수가 낮음", async () => {
    // pHash는 색이 아닌 *구조*를 보므로 패턴이 달라야 함
    const a = await patternImage(7);
    const b = await patternImage(43);
    const r = await phashMetric(a, b);
    expect(r.score).toBeLessThan(0.95);
  });

  it("결과는 0~1 범위에 있음", async () => {
    const a = await solidColor(128, 64, 200);
    const b = await solidColor(64, 128, 100);
    const r = await phashMetric(a, b);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe("color-histogram 메트릭", () => {
  it("같은 색은 점수 1.0", async () => {
    const a = await solidColor(120, 80, 200);
    const r = await colorHistogramMetric(a, a);
    expect(r.score).toBeGreaterThanOrEqual(0.99);
  });

  it("정반대 색은 점수가 낮음", async () => {
    const a = await solidColor(255, 0, 0);
    const b = await solidColor(0, 255, 0);
    const r = await colorHistogramMetric(a, b);
    expect(r.score).toBeLessThan(0.5);
  });
});

describe("aggregate", () => {
  it("LLM-judge 없을 때 phash + color로 가중 평균", () => {
    const score = aggregate([
      { metric: "phash", score: 0.9 },
      { metric: "color-histogram", score: 0.8 },
    ]);
    // 0.9 * 0.6 + 0.8 * 0.4 = 0.54 + 0.32 = 0.86
    expect(score).toBeCloseTo(0.86, 2);
  });

  it("LLM-judge 있으면 가중치 0.5/0.3/0.2로 계산", () => {
    const score = aggregate([
      { metric: "llm-judge", score: 1.0 },
      { metric: "phash", score: 0.5 },
      { metric: "color-histogram", score: 0.5 },
    ]);
    // 1.0 * 0.5 + 0.5 * 0.3 + 0.5 * 0.2 = 0.5 + 0.15 + 0.10 = 0.75
    expect(score).toBeCloseTo(0.75, 2);
  });
});

describe("dataset 로드", () => {
  it("characters.yaml에 캐릭터 5개 이상 + adversarial 1개 포함", () => {
    const chars = loadCharacters();
    expect(chars.length).toBeGreaterThanOrEqual(5);
    expect(chars.some((c) => c.adversarial)).toBe(true);
    for (const c of chars) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.seed_prompt.length).toBeGreaterThan(20);
      expect(c.features.length).toBeGreaterThan(0);
    }
  });

  it("emotions.yaml에 32개 슬롯", () => {
    const emotions = loadEmotions();
    expect(emotions).toHaveLength(32);
    expect(emotions[0].slot).toBe(1);
    expect(emotions[31].slot).toBe(32);
  });
});

describe("MockGenerator", () => {
  it("시드 + 변형 생성이 PNG bytes 반환", async () => {
    const gen = new MockGenerator();
    const chars = loadCharacters();
    const emotions = loadEmotions();
    const seed = await gen.generateSeed(chars[0]);
    expect(seed.imageBytes.length).toBeGreaterThan(100);
    expect(seed.generator).toBe("mock");

    const variant = await gen.generateVariant({
      character: chars[0],
      emotion: emotions[0],
      referenceImage: seed.imageBytes,
    });
    expect(variant.imageBytes.length).toBeGreaterThan(100);
    expect(variant.slot).toBe(1);
  });
});
