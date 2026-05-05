import "dotenv/config";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { runEval } from "./runner";
import { writeHtmlReport } from "./reporter/html";
import { renderMarkdown } from "./reporter/markdown";
import { MockGenerator } from "./runners/mock";
import { NanoBananaGenerator } from "./runners/nano-banana";
import { ReplicateSDXLGenerator } from "./runners/replicate-sdxl";
import type { Generator } from "./types";

type Args = {
  generator: "mock" | "nano-banana" | "replicate-sdxl";
  outDir: string;
  characters?: string[];
  slots?: number[];
  concurrency: number;
  useLlmJudge: boolean;
  llmJudgeSampleRate: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    generator: "mock",
    outDir: resolve(process.cwd(), "evals/runs"),
    concurrency: 4,
    useLlmJudge: true,
    llmJudgeSampleRate: 1.0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--generator") out.generator = next() as Args["generator"];
    else if (a === "--out") out.outDir = resolve(next());
    else if (a === "--characters") out.characters = next().split(",");
    else if (a === "--slots") out.slots = next().split(",").map(Number);
    else if (a === "--concurrency") out.concurrency = Number(next());
    else if (a === "--no-llm-judge") out.useLlmJudge = false;
    else if (a === "--llm-judge-rate") out.llmJudgeSampleRate = Number(next());
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp() {
  console.log(`VibeMoji 일관성 평가 CLI

사용법:
  npx tsx evals/cli.ts [options]

옵션:
  --generator <name>       mock | nano-banana | replicate-sdxl (default: mock)
  --out <dir>              결과 저장 폴더 (default: evals/runs)
  --characters <a,b,c>     실행할 캐릭터 ID 화이트리스트 (default: 전체)
  --slots <1,2,3>          실행할 감정 슬롯 (default: 1-32 전체)
  --concurrency <n>        변형 동시 생성 수 (default: 4)
  --no-llm-judge           LLM-judge 메트릭 비활성화
  --llm-judge-rate <0-1>   LLM-judge 샘플링 비율 (비용 절감용, default: 1.0)
  --help, -h               도움말

예시:
  # 빠른 mock 실행 (CI용)
  npx tsx evals/cli.ts

  # 실제 Nano Banana로 1개 캐릭터 4개 슬롯만 검증
  GEMINI_API_KEY=xxx npx tsx evals/cli.ts \\
    --generator nano-banana --characters pink-rabbit --slots 1,5,17,25

  # LLM-judge 25% 샘플링으로 비용 절감
  GEMINI_API_KEY=xxx npx tsx evals/cli.ts \\
    --generator nano-banana --llm-judge-rate 0.25
`);
}

function pickGenerator(name: string): Generator {
  switch (name) {
    case "mock":
      return new MockGenerator();
    case "nano-banana":
      return new NanoBananaGenerator();
    case "replicate-sdxl":
      return new ReplicateSDXLGenerator();
    default:
      throw new Error(`알 수 없는 generator: ${name}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generator = pickGenerator(args.generator);

  if (!generator.isConfigured()) {
    console.error(
      `❌ ${generator.name} 미설정. 환경변수를 확인하세요. (mock은 항상 가능)`
    );
    process.exit(1);
  }

  console.log(`🚀 일관성 평가 시작 — generator: ${generator.name}`);
  console.log(`   캐릭터: ${args.characters?.join(",") ?? "전체"}`);
  console.log(`   슬롯: ${args.slots?.join(",") ?? "1-32"}`);
  console.log(`   LLM-judge: ${args.useLlmJudge ? `활성 (sample ${args.llmJudgeSampleRate})` : "비활성"}`);
  console.log("");

  const report = await runEval({
    generator,
    outDir: args.outDir,
    characterIds: args.characters,
    slots: args.slots,
    concurrency: args.concurrency,
    useLlmJudge: args.useLlmJudge,
    llmJudgeSampleRate: args.llmJudgeSampleRate,
  });

  const runDir = resolve(args.outDir, report.runId);
  const htmlPath = resolve(runDir, "report.html");
  const mdPath = resolve(runDir, "report.md");
  writeHtmlReport(report, htmlPath);
  writeFileSync(mdPath, renderMarkdown(report));

  console.log("");
  console.log(`📊 전체 평균: ${report.overallScore.toFixed(3)}`);
  console.log(`💰 총 비용: $${report.totalCostUsd.toFixed(3)}`);
  console.log(`📄 HTML 리포트: ${htmlPath}`);
  console.log(`📝 Markdown 리포트: ${mdPath}`);
  console.log(report.passed ? "✅ PASSED" : "❌ FAILED");

  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
