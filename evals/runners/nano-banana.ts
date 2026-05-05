import { GoogleGenAI } from "@google/genai";
import type {
  Character,
  Generator,
  GenerationRequest,
  GenerationResult,
} from "../types";

/**
 * Gemini 2.5 Flash Image (Nano Banana) 어댑터.
 *
 * - 시드 생성: text-only prompt
 * - Variant 생성: seed image를 reference로 첨부 → 캐릭터 일관성 활용
 *
 * 단가: 1 image ≈ 1290 output tokens × $30 / 1M = $0.039
 *
 * 사용법:
 *   GEMINI_API_KEY=your_key npx tsx evals/cli.ts --generator nano-banana
 */
export class NanoBananaGenerator implements Generator {
  readonly name = "nano-banana";
  private client?: GoogleGenAI;
  private readonly model = "gemini-2.5-flash-image";

  constructor(apiKey: string | undefined = process.env.GEMINI_API_KEY) {
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  isConfigured() {
    return !!this.client;
  }

  async generateSeed(character: Character): Promise<GenerationResult> {
    if (!this.client) {
      throw new Error("Nano Banana 미설정: GEMINI_API_KEY 환경변수 필요");
    }
    const prompt = character.seed_prompt;
    const start = Date.now();
    const buf = await this.callImageModel(prompt);
    return {
      characterId: character.id,
      slot: 0,
      emotionLabel: "seed",
      imageBytes: buf,
      generator: this.name,
      latencyMs: Date.now() - start,
      costUsd: 0.039,
      promptUsed: prompt,
    };
  }

  async generateVariant(req: GenerationRequest): Promise<GenerationResult> {
    if (!this.client) {
      throw new Error("Nano Banana 미설정");
    }
    const prompt = buildVariantPrompt(req);
    const start = Date.now();
    const buf = await this.callImageModel(prompt, req.referenceImage);
    return {
      characterId: req.character.id,
      slot: req.emotion.slot,
      emotionLabel: req.emotion.label,
      imageBytes: buf,
      generator: this.name,
      latencyMs: Date.now() - start,
      costUsd: 0.039,
      promptUsed: prompt,
    };
  }

  private async callImageModel(
    prompt: string,
    referenceImage?: Buffer
  ): Promise<Buffer> {
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: prompt }];

    if (referenceImage) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: referenceImage.toString("base64"),
        },
      });
    }

    const response = await this.client!.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
    });

    const candidates = response.candidates ?? [];
    for (const cand of candidates) {
      for (const part of cand.content?.parts ?? []) {
        if ("inlineData" in part && part.inlineData?.data) {
          return Buffer.from(part.inlineData.data, "base64");
        }
      }
    }
    throw new Error("Nano Banana 응답에 이미지가 없음");
  }
}

function buildVariantPrompt(req: GenerationRequest): string {
  const { character, emotion } = req;
  return [
    `IMPORTANT: Keep EXACTLY the same character as the reference image.`,
    `Character: ${character.name}.`,
    `Required identity features that MUST stay consistent: ${character.features.join(", ")}.`,
    `New action/expression: ${emotion.action}.`,
    `Style: thick black outline, flat sticker illustration, transparent background, square 1:1 frame.`,
    `Do not change body proportions, color palette, or distinctive markings.`,
    `Slot label (small text overlay optional): "${emotion.label}".`,
  ].join("\n");
}
