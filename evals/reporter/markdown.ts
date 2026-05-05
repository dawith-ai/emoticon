import type { RunReport } from "../types";
import { THRESHOLDS } from "../thresholds";

/**
 * 마크다운 리포트 — CI PR 코멘트나 작업일지 임베드용.
 */
export function renderMarkdown(report: RunReport): string {
  const status = report.passed ? "✅ PASSED" : "❌ FAILED";
  const lines = [
    `## 🎯 일관성 평가 리포트`,
    ``,
    `- **Run ID**: \`${report.runId}\``,
    `- **Generator**: \`${report.generator}\``,
    `- **Status**: ${status}`,
    `- **전체 평균 점수**: ${report.overallScore.toFixed(3)}`,
    `- **총 비용**: $${report.totalCostUsd.toFixed(3)}`,
    ``,
    `### 임계치`,
    `- aggregate ≥ ${THRESHOLDS.aggregate}`,
    `- character mean ≥ ${THRESHOLDS.characterMean}`,
    `- failures ≤ ${THRESHOLDS.failureCountMax}`,
    `- llm-judge ≥ ${THRESHOLDS.llmJudgeMin}`,
    ``,
    `### 캐릭터별 결과`,
    ``,
    `| 캐릭터 | 평균 | 최저 | 실패 변형 | 결과 |`,
    `|--------|------|------|----------|------|`,
    ...report.characters.map((c) => {
      const ok =
        c.meanScore >= THRESHOLDS.characterMean &&
        c.failureCount <= THRESHOLDS.failureCountMax;
      return `| ${c.characterName} | ${c.meanScore.toFixed(3)} | ${c.minScore.toFixed(3)} | ${c.failureCount}/${c.variants.length} | ${ok ? "✅" : "❌"} |`;
    }),
    ``,
  ];

  // 실패 변형 자세히
  const failures = report.characters.flatMap((c) =>
    c.variants
      .filter((v) => v.aggregateScore < THRESHOLDS.aggregate)
      .map((v) => ({ char: c.characterName, ...v }))
  );
  if (failures.length > 0) {
    lines.push(`### 실패 변형 상세 (점수 < ${THRESHOLDS.aggregate})`, "");
    lines.push(`| 캐릭터 | 슬롯 | 감정 | 점수 | 주요 메트릭 |`);
    lines.push(`|--------|------|------|------|------------|`);
    for (const f of failures.slice(0, 50)) {
      const metrics = f.metrics
        .map((m) => `${m.metric}: ${m.score.toFixed(2)}`)
        .join(" / ");
      lines.push(
        `| ${f.char} | #${f.slot} | ${f.emotionLabel} | ${f.aggregateScore.toFixed(3)} | ${metrics} |`
      );
    }
  }

  return lines.join("\n");
}
