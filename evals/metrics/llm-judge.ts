import { GoogleGenAI } from "@google/genai";
import type { Character, MetricResult } from "../types";

/**
 * LLM-as-Judge 일관성 평가 (Gemini 2.5 Flash Vision).
 *
 * 시드 + 변형 이미지를 함께 보여주고 "같은 캐릭터인가?" 1-5 점수와 이유를 받음.
 * 자동 메트릭(pHash, 색상)이 못 잡는 의미적 변화 (귀 모양, 눈 위치, 표정 외 정체성 등)를 잡음.
 *
 * 단가: ≈ $0.0006/call (text + 2 images, gemini-2.5-flash)
 *
 * 사용법:
 *   GEMINI_API_KEY=... 환경변수 필요. 없으면 score=null과 note 반환.
 */
export class LLMJudge {
  private client?: GoogleGenAI;
  private readonly model = "gemini-2.5-flash";

  constructor(apiKey: string | undefined = process.env.GEMINI_API_KEY) {
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  isConfigured() {
    return !!this.client;
  }

  async judge(
    character: Character,
    seed: Buffer,
    variant: Buffer,
    emotionLabel: string
  ): Promise<MetricResult> {
    if (!this.client) {
      return {
        metric: "llm-judge",
        score: 0.5, // 중립 (configured 안 됐을 때 결과를 막지 않기 위함)
        note: "GEMINI_API_KEY 미설정 — LLM-judge 스킵 (중립 점수 0.5 반환)",
      };
    }

    const prompt = buildJudgePrompt(character, emotionLabel);

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: { mimeType: "image/png", data: seed.toString("base64") },
              },
              {
                inlineData: { mimeType: "image/png", data: variant.toString("base64") },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 1, maximum: 5 },
              reason: { type: "string" },
              violated_features: { type: "array", items: { type: "string" } },
            },
            required: ["score", "reason"],
          },
        },
      });

      const text = response.text ?? "";
      const parsed = JSON.parse(text) as {
        score: number;
        reason: string;
        violated_features?: string[];
      };

      // 1-5 점수를 0-1로 정규화 (1=완전히 다른 캐릭터, 5=동일)
      const normalized = (parsed.score - 1) / 4;
      return {
        metric: "llm-judge",
        score: normalized,
        raw: parsed.score,
        note: `${parsed.score}/5: ${parsed.reason}${
          parsed.violated_features?.length
            ? ` [위반: ${parsed.violated_features.join(", ")}]`
            : ""
        }`,
      };
    } catch (err) {
      return {
        metric: "llm-judge",
        score: 0.5,
        note: `LLM-judge 실패 (중립 0.5 반환): ${(err as Error).message}`,
      };
    }
  }
}

function buildJudgePrompt(character: Character, emotionLabel: string): string {
  return [
    `당신은 카카오 이모티콘 심사관입니다. 두 이미지가 같은 캐릭터인지 평가하세요.`,
    ``,
    `캐릭터 이름: ${character.name}`,
    `반드시 유지되어야 하는 정체성 특징:`,
    ...character.features.map((f) => `  - ${f}`),
    ``,
    `이미지 1: 시드(기준) 이미지`,
    `이미지 2: "${emotionLabel}" 표정의 변형 이미지`,
    ``,
    `평가 기준 (1~5점, JSON 응답):`,
    `  5점: 완전히 같은 캐릭터, 모든 특징 일치, 표정만 변함`,
    `  4점: 같은 캐릭터, 1개 미세 특징 차이 (수용 가능)`,
    `  3점: 같은 캐릭터인 듯하지만 2개 이상 특징 변경 (애매함)`,
    `  2점: 비슷한 컨셉이지만 다른 캐릭터로 보임`,
    `  1점: 완전히 다른 캐릭터`,
    ``,
    `JSON 형식으로 응답:`,
    `{ "score": 1-5, "reason": "...", "violated_features": ["..."] }`,
  ].join("\n");
}
