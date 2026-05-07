/**
 * Gemini 2.5 Flash Image (Nano Banana) 직접 브라우저 호출 어댑터.
 *
 * 핵심: 사용자가 BYOK로 자기 키를 제공하면, 우리 서버를 거치지 않고
 *       https://generativelanguage.googleapis.com 으로 fetch.
 *
 * 장점:
 *   - 운영자 비용 0원
 *   - Cloud Functions / Blaze 불필요
 *   - 사용자는 무료 티어(분당 ~10회) 안에서 무제한 사용
 *   - reference image 지원 → 캐릭터 일관성 보장
 *
 * 보안: 사용자가 자신의 키를 자기 브라우저에서만 사용. 우리 서버는 키를 저장/전송 안 함.
 *       BYOK 컴포넌트가 localStorage 보관 + 약관 동의 + 마스킹 처리.
 */

import { getActiveByokKey } from "@/lib/byok";
import {
  base64ToBlob,
  blobToBase64,
  type AIGenerator,
  type GenerationInput,
} from "./types";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export class GeminiDirectGenerator implements AIGenerator {
  readonly id = "gemini" as const;
  readonly label = "✨ Gemini 2.5 Flash Image (BYOK)";
  readonly description =
    "사용자 본인 키로 브라우저에서 직접 호출. 운영자 비용 0원. 같은 캐릭터로 32장 일관성 유지 (reference image 지원).";
  readonly cost = {
    perCall: 0,
    freeNote: "Google AI Studio 무료 티어 사용 시 0원 (분당 ~10회 한도)",
  };
  readonly supportsReference = true;
  readonly auth = "byok-required" as const;

  isReady() {
    return !!getActiveByokKey();
  }

  async generate(input: GenerationInput): Promise<Blob> {
    const apiKey = getActiveByokKey();
    if (!apiKey) {
      throw new Error(
        "Gemini 키가 없어요. /settings 에서 BYOK 키를 등록해주세요.",
      );
    }

    const parts: GeminiPart[] = [{ text: input.prompt }];
    if (input.referenceBlob) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: await blobToBase64(input.referenceBlob),
        },
      });
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const truncated = text.length > 240 ? `${text.slice(0, 240)}…` : text;
      throw new Error(`Gemini ${res.status}: ${truncated}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string } }> };
      }>;
    };
    for (const cand of data.candidates ?? []) {
      for (const part of cand.content?.parts ?? []) {
        const b64 = part.inlineData?.data;
        if (b64) return base64ToBlob(b64, "image/png");
      }
    }
    throw new Error(
      "Gemini 응답에 이미지가 없어요. 프롬프트가 안전 정책에 걸렸을 수 있어요.",
    );
  }
}
