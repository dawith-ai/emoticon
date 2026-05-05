import { writeFileSync, readFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import type { RunReport } from "../types";
import { THRESHOLDS } from "../thresholds";

/**
 * HTML 리포트 생성기 — 캐릭터별 시드/변형 그리드 + 점수 표시.
 * 모든 이미지는 base64로 임베드 (단일 파일 공유 용이).
 */
export function writeHtmlReport(report: RunReport, outPath: string): void {
  const html = renderHtml(report);
  writeFileSync(outPath, html);
}

function renderHtml(report: RunReport): string {
  const status = report.passed
    ? '<span class="badge pass">✅ PASSED</span>'
    : '<span class="badge fail">❌ FAILED</span>';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>일관성 평가 리포트 ${report.runId}</title>
<style>
  body { font-family: system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif; max-width: 1280px; margin: 0 auto; padding: 24px; background: #faf7ff; color: #1f1b2e; }
  h1 { background: linear-gradient(135deg, #ff5c8a, #9c7bff, #ffd166); -webkit-background-clip: text; color: transparent; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
  .stat { background: white; padding: 16px; border-radius: 12px; }
  .stat .label { color: #888; font-size: 12px; }
  .stat .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .badge { padding: 6px 12px; border-radius: 999px; font-weight: 700; font-size: 13px; }
  .pass { background: #d1fae5; color: #065f46; }
  .fail { background: #fee2e2; color: #991b1b; }
  .character { background: white; padding: 20px; border-radius: 16px; margin: 16px 0; }
  .character header { display: flex; justify-content: space-between; align-items: center; }
  .character h2 { margin: 0; }
  .grid { display: grid; grid-template-columns: 200px repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; margin-top: 12px; }
  .seed, .variant { background: #efe8ff; border-radius: 8px; padding: 6px; text-align: center; font-size: 11px; }
  .seed { grid-column: 1; grid-row: span 6; padding: 12px; }
  .seed strong { display: block; margin-bottom: 6px; }
  .variant img, .seed img { width: 100%; height: auto; border-radius: 4px; }
  .variant .score { display: block; margin-top: 4px; font-weight: 700; }
  .variant.fail { background: #fee2e2; }
  .variant.warn { background: #fef3c7; }
  .variant.pass { background: #d1fae5; }
  .metrics { font-size: 10px; color: #666; line-height: 1.4; margin-top: 2px; }
  details { margin-top: 16px; }
  details summary { cursor: pointer; font-weight: 600; }
  .threshold { font-size: 12px; color: #666; }
</style>
</head>
<body>
  <h1>🎯 VibeMoji 일관성 평가 리포트</h1>
  <p>Run ID: <code>${report.runId}</code> · Generator: <strong>${report.generator}</strong> · ${status}</p>

  <div class="summary">
    <div class="stat"><div class="label">전체 평균 점수</div><div class="value">${report.overallScore.toFixed(3)}</div></div>
    <div class="stat"><div class="label">캐릭터 수</div><div class="value">${report.characters.length}</div></div>
    <div class="stat"><div class="label">총 변형 수</div><div class="value">${report.characters.reduce((a, c) => a + c.variants.length, 0)}</div></div>
    <div class="stat"><div class="label">실패 변형 수</div><div class="value">${report.characters.reduce((a, c) => a + c.failureCount, 0)}</div></div>
    <div class="stat"><div class="label">총 비용</div><div class="value">$${report.totalCostUsd.toFixed(3)}</div></div>
  </div>

  <p class="threshold">
    임계치 — aggregate ≥ ${THRESHOLDS.aggregate}, character mean ≥ ${THRESHOLDS.characterMean},
    failures ≤ ${THRESHOLDS.failureCountMax}, llm-judge ≥ ${THRESHOLDS.llmJudgeMin}
  </p>

  ${report.characters.map(renderCharacter).join("\n")}

  <details>
    <summary>Raw JSON</summary>
    <pre style="background:#000;color:#0f0;padding:12px;overflow:auto;">${escapeHtml(
      JSON.stringify(report, null, 2)
    )}</pre>
  </details>
</body>
</html>`;
}

function renderCharacter(c: RunReport["characters"][number]): string {
  const seedImg = imageDataUri(c.seedPath);
  return `
  <section class="character">
    <header>
      <h2>${c.characterName} <small style="color:#888">(${c.characterId})</small></h2>
      <div>
        평균 ${c.meanScore.toFixed(3)} · 최저 ${c.minScore.toFixed(3)} · 실패 ${c.failureCount}
      </div>
    </header>
    <div class="grid">
      <div class="seed">
        <strong>SEED</strong>
        <img src="${seedImg}" alt="seed" />
      </div>
      ${c.variants
        .map((v) => {
          const cls =
            v.aggregateScore >= THRESHOLDS.aggregate
              ? "pass"
              : v.aggregateScore >= 0.7
              ? "warn"
              : "fail";
          const variantImg = imageDataUri(v.variantPath);
          const metricsHtml = v.metrics
            .map((m) => `${m.metric.replace("color-histogram", "color")}: ${m.score.toFixed(2)}`)
            .join("<br/>");
          return `<div class="variant ${cls}" title="${escapeHtml(
            v.metrics.map((m) => m.note ?? "").join(" / ")
          )}">
            <img src="${variantImg}" alt="${escapeHtml(v.emotionLabel)}" />
            <span>#${v.slot} ${escapeHtml(v.emotionLabel)}</span>
            <span class="score">${v.aggregateScore.toFixed(2)}</span>
            <div class="metrics">${metricsHtml}</div>
          </div>`;
        })
        .join("")}
    </div>
  </section>`;
}

function imageDataUri(path: string): string {
  try {
    const buf = readFileSync(path);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
