/**
 * Pollinations.ai 어댑터 — API 키 없이 즉시 호출 가능한 무료 이미지 생성.
 *
 * 동작: GET https://image.pollinations.ai/prompt/{prompt}?width=...&height=...&model=flux
 *       응답이 PNG 이미지 자체. CORS 허용되어 있어 <img crossOrigin="anonymous">로
 *       로드 후 canvas drawImage → toBlob('image/png')로 Blob 추출.
 *
 * 한계:
 *   - reference image 미지원 → 캐릭터 일관성은 prompt에만 의존
 *   - 무료 공개 서비스라 가끔 응답 지연/실패 가능
 *   - Watermark 없는 옵션(`nologo=true`)은 best-effort
 */

import type { AIGenerator, GenerationInput } from "./types";

const ENDPOINT = "https://image.pollinations.ai/prompt";

export class PollinationsGenerator implements AIGenerator {
  readonly id = "pollinations" as const;
  readonly label = "🌸 Pollinations (즉시 사용, 무료)";
  readonly description =
    "API 키 없이 바로 동작. Flux 모델 기반. 캐릭터 일관성은 프롬프트로만 유지 — 디테일이 적은 캐릭터에 유리.";
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
    const url = new URL(`${ENDPOINT}/${encodeURIComponent(input.prompt)}`);
    url.searchParams.set("width", String(input.width ?? 512));
    url.searchParams.set("height", String(input.height ?? 512));
    url.searchParams.set("model", "flux");
    url.searchParams.set("nologo", "true");
    url.searchParams.set("private", "true");
    if (input.seed != null) url.searchParams.set("seed", String(input.seed));

    return fetchAsBlob(url.toString(), input.width ?? 512, input.height ?? 512);
  }
}

async function fetchAsBlob(url: string, w: number, h: number): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Pollinations 응답 시간 초과 (60초)")),
      60_000,
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
