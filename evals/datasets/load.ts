import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { Character, Emotion } from "../types";

// tsx CJS / ESM 모두에서 안전한 디렉터리 해석
const ROOT = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  // @ts-ignore - import.meta는 ESM에서만 존재
  if (typeof import.meta?.url === "string") {
    // @ts-ignore
    return dirname(fileURLToPath(import.meta.url));
  }
  return resolve(process.cwd(), "evals/datasets");
})();

export function loadCharacters(): Character[] {
  const raw = readFileSync(resolve(ROOT, "characters.yaml"), "utf8");
  const parsed = yaml.load(raw) as { characters: Character[] };
  return parsed.characters;
}

export function loadEmotions(): Emotion[] {
  const raw = readFileSync(resolve(ROOT, "emotions.yaml"), "utf8");
  const parsed = yaml.load(raw) as { emotions: Emotion[] };
  return parsed.emotions;
}
