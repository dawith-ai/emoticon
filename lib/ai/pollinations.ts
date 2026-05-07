/**
 * Pollinations.ai 어댑터 — API 키 없이 즉시 호출 가능한 무료 이미지 생성.
 *
 * 동작: GET https://image.pollinations.ai/prompt/{prompt}?model=...&enhance=true
 *       응답이 PNG. CORS 허용되어 <img crossOrigin="anonymous">로 로드 후
 *       canvas drawImage → toBlob('image/png')로 Blob 추출.
 *
 * 품질 끌어올리기:
 *   - 1024 해상도 권장 (디테일 + downscale 시 매끈)
 *   - `enhance=true` — Pollinations 측 LLM이 prompt를 자동 보강
 *   - 프롬프트 앵커 — "kakao emoticon, sticker, thick black outline, kawaii"
 *   - 모델 다중 폴백 — flux → sana → 첫 번째 성공
 *
 * 한계:
 *   - reference image 미지원 → 캐릭터 일관성은 prompt + seed에만 의존
 *   - 무료 공개 서비스라 가끔 응답 지연/실패 가능
 */

import type { AIGenerator, GenerationInput } from "./types";

const ENDPOINT = "https://image.pollinations.ai/prompt";

/** 우선순위 — 첫 번째가 메인, 실패 시 다음으로 폴백 */
const MODEL_FALLBACK = ["flux", "sana"] as const;

export class PollinationsGenerator implements AIGenerator {
  readonly id = "pollinations" as const;
  readonly label = "🌸 Pollinations (무료, 키 불필요)";
  readonly description =
    "API 키 없이 바로 동작. Flux/Sana 모델 + Pollinations LLM 프롬프트 자동 보강. 카카오 심사용보단 미리보기/연습용 권장. 진짜 수익화 퀄리티는 Gemini BYOK 사용.";
  readonly cost = {
    perCall: 0,
    freeNote: "키 불필요 · 공개 API · 운영자 비용 0원",
  };
  readonly supportsReference = false;
  readonly auth = "none" as const;

  isReady() {
    return true;
  }

  async generate(input: GenerationInput): Promise<Blob> {
    const w = input.width ?? 1024;
    const h = input.height ?? 1024;
    const enhanced = enrichPrompt(input.prompt);

    let lastErr: unknown = null;
    for (const model of MODEL_FALLBACK) {
      const url = new URL(`${ENDPOINT}/${encodeURIComponent(enhanced)}`);
      url.searchParams.set("width", String(w));
      url.searchParams.set("height", String(h));
      url.searchParams.set("model", model);
      url.searchParams.set("enhance", "true");
      url.searchParams.set("nologo", "true");
      url.searchParams.set("private", "true");
      if (input.seed != null) url.searchParams.set("seed", String(input.seed));

      try {
        return await fetchAsBlob(url.toString(), w, h);
      } catch (err) {
        lastErr = err;
        // 다음 모델 폴백
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Pollinations 모든 모델 실패");
  }
}

/**
 * 카카오/라인 이모티콘 심사 가이드라인에 가까운 스타일 앵커를 강제로 부착.
 * 사용자가 이미 비슷한 키워드를 넣었으면 중복돼도 무해.
 */
function enrichPrompt(p: string): string {
  return [
    p.trim(),
    "kakao emoticon style, line sticker style",
    "thick black outline, clean flat colors, cel-shaded, no gradients",
    "kawaii cute character, single character only",
    "centered composition, plain white background, square 1:1",
    "high quality, sharp lines, professional sticker design",
    "no text, no watermark, no signature, no logo, no extra elements",
  ].join(", ");
}

async function fetchAsBlob(url: string, w: number, h: number): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Pollinations 응답 시간 초과 (90초)")),
      90_000,
    );
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Pollinations 이미지 로드 실패"));
    };
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Blob 변환 실패")),
      "image/png",
    );
  });
}
