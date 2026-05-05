/**
 * 일관성 통과 기준 (consistency thresholds).
 *
 * 이 값들은 캐릭터 일관성 검증의 게이트입니다.
 * 변경 시 작업일지에 근거 기록 필수.
 *
 * - aggregate ≥ 0.80: 변형 1장이 합격으로 간주되는 점수
 * - characterMean ≥ 0.83: 캐릭터 32장 평균 점수
 * - failureCountMax ≤ 4: 캐릭터당 0.80 미만 변형 허용 개수 (32장 중 12.5%)
 * - llmJudgeMin ≥ 0.75 (= 4/5점): 평균 LLM-judge 점수 (사람이 보기에 같은 캐릭터로 인식)
 *
 * 근거:
 *   - 카카오 미승인 사례 분석 시 "같은 캐릭터인지 모호함" 지적이 가장 흔함
 *   - 32장 중 4장 이상 깨지면 작가 검수 부담이 너무 커서 사용 가치 ↓
 *   - LLM-judge 4점 미만은 사용자가 재생성을 원할 가능성 높음
 */
export const THRESHOLDS = {
  aggregate: 0.8,
  characterMean: 0.83,
  failureCountMax: 4,
  llmJudgeMin: 0.75,
} as const;

export type Thresholds = typeof THRESHOLDS;
