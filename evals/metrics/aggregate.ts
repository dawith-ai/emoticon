import type { MetricResult } from "../types";

/**
 * 메트릭 가중 평균 → 최종 일관성 점수 (0-1).
 *
 * 가중치 근거:
 *   - LLM-judge 0.5: 의미적 정체성 판정. 가장 신뢰도 높지만 비용/지연 있음.
 *   - phash 0.3: 빠르고 결정론적. 색상보다 구조 변화 민감.
 *   - color-histogram 0.2: 색상 정체성 보호. 단순하지만 효과 큼.
 *
 * LLM-judge가 없으면 phash 0.6 / color 0.4로 재분배.
 */
export const DEFAULT_WEIGHTS = {
  "llm-judge": 0.5,
  phash: 0.3,
  "color-histogram": 0.2,
} as const;

export function aggregate(metrics: MetricResult[]): number {
  const has = new Set(metrics.map((m) => m.metric));

  // LLM-judge 미적용 시 가중치 재분배
  const weights = has.has("llm-judge")
    ? DEFAULT_WEIGHTS
    : { "llm-judge": 0, phash: 0.6, "color-histogram": 0.4 };

  let total = 0;
  let usedWeight = 0;
  for (const m of metrics) {
    const w = (weights as Record<string, number>)[m.metric] ?? 0;
    if (w > 0) {
      total += m.score * w;
      usedWeight += w;
    }
  }
  return usedWeight > 0 ? total / usedWeight : 0;
}
