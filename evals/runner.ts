import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCharacters, loadEmotions } from "./datasets/load";
import { phashMetric } from "./metrics/phash";
import { colorHistogramMetric } from "./metrics/color-histogram";
import { LLMJudge } from "./metrics/llm-judge";
import { aggregate } from "./metrics/aggregate";
import { THRESHOLDS } from "./thresholds";
import type {
  Character,
  CharacterEval,
  Generator,
  MetricResult,
  RunReport,
  StickerEval,
} from "./types";

export type RunOptions = {
  generator: Generator;
  outDir: string;
  /** 활성화된 캐릭터 ID 화이트리스트 (없으면 전체) */
  characterIds?: string[];
  /** 활성화할 슬롯 (없으면 32개 전체) */
  slots?: number[];
  /** 동시 실행 변형 수 */
  concurrency?: number;
  /** LLM-judge 활성화 여부 */
  useLlmJudge?: boolean;
  /** LLM-judge 호출 비율 (1.0 = 전체, 0.25 = 1/4 샘플링하여 비용 절감) */
  llmJudgeSampleRate?: number;
};

export async function runEval(options: RunOptions): Promise<RunReport> {
  const {
    generator,
    outDir,
    characterIds,
    slots,
    concurrency = 4,
    useLlmJudge = true,
    llmJudgeSampleRate = 1.0,
  } = options;

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = resolve(outDir, runId);
  mkdirSync(runDir, { recursive: true });

  const allCharacters = loadCharacters();
  const characters = characterIds
    ? allCharacters.filter((c) => characterIds.includes(c.id))
    : allCharacters;
  const allEmotions = loadEmotions();
  const emotions = slots
    ? allEmotions.filter((e) => slots.includes(e.slot))
    : allEmotions;

  const judge = useLlmJudge ? new LLMJudge() : null;

  const startedAt = new Date().toISOString();
  const characterEvals: CharacterEval[] = [];
  let totalCost = 0;

  for (const character of characters) {
    console.log(`\n📦 ${character.name} (${character.id})`);

    // 시드 생성
    const seedResult = await generator.generateSeed(character);
    totalCost += seedResult.costUsd ?? 0;
    const charDir = resolve(runDir, character.id);
    mkdirSync(charDir, { recursive: true });
    const seedPath = resolve(charDir, "seed.png");
    writeFileSync(seedPath, seedResult.imageBytes);
    console.log(`  ✓ seed (${seedResult.latencyMs}ms)`);

    // 변형 생성 (동시 실행 제한)
    const variants: StickerEval[] = [];
    for (let i = 0; i < emotions.length; i += concurrency) {
      const batch = emotions.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((emotion) =>
          generator.generateVariant({
            character,
            emotion,
            referenceImage: seedResult.imageBytes,
          })
        )
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const emotion = batch[j];
        totalCost += r.costUsd ?? 0;
        const variantPath = resolve(
          charDir,
          `slot-${String(emotion.slot).padStart(2, "0")}-${emotion.label}.png`
        );
        writeFileSync(variantPath, r.imageBytes);

        // 메트릭 측정
        const metrics: MetricResult[] = [];
        const [phashRes, colorRes] = await Promise.all([
          phashMetric(seedResult.imageBytes, r.imageBytes),
          colorHistogramMetric(seedResult.imageBytes, r.imageBytes),
        ]);
        metrics.push(phashRes, colorRes);

        // LLM-judge 샘플링
        if (judge?.isConfigured() && Math.random() < llmJudgeSampleRate) {
          const judgeRes = await judge.judge(
            character,
            seedResult.imageBytes,
            r.imageBytes,
            emotion.label
          );
          metrics.push(judgeRes);
        }

        const aggregateScore = aggregate(metrics);
        variants.push({
          characterId: character.id,
          slot: emotion.slot,
          emotionLabel: emotion.label,
          generator: generator.name,
          variantPath,
          seedPath,
          metrics,
          aggregateScore,
        });
        const flag = aggregateScore < THRESHOLDS.aggregate ? "❌" : "✓";
        console.log(
          `  ${flag} slot ${emotion.slot} ${emotion.label}: ${aggregateScore.toFixed(3)}`
        );
      }
    }

    const scores = variants.map((v) => v.aggregateScore);
    const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const minScore = Math.min(...scores);
    const failureCount = scores.filter((s) => s < THRESHOLDS.aggregate).length;

    characterEvals.push({
      characterId: character.id,
      characterName: character.name,
      generator: generator.name,
      seedPath,
      variants,
      meanScore,
      minScore,
      failureCount,
    });
  }

  const finishedAt = new Date().toISOString();
  const overallScore =
    characterEvals.reduce((a, c) => a + c.meanScore, 0) / characterEvals.length;
  const passed = checkPass(characterEvals, overallScore);

  const report: RunReport = {
    runId,
    startedAt,
    finishedAt,
    generator: generator.name,
    characters: characterEvals,
    overallScore,
    totalCostUsd: totalCost,
    passed,
    thresholds: { ...THRESHOLDS },
  };

  writeFileSync(resolve(runDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}

function checkPass(chars: CharacterEval[], overall: number): boolean {
  if (overall < THRESHOLDS.aggregate) return false;
  for (const c of chars) {
    if (c.meanScore < THRESHOLDS.characterMean) return false;
    if (c.failureCount > THRESHOLDS.failureCountMax) return false;
  }
  return true;
}
