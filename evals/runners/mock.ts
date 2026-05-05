import sharp from "sharp";
import type {
  Character,
  Generator,
  GenerationRequest,
  GenerationResult,
} from "../types";

/**
 * Mock generator — API 키 없이 하네스 자체를 검증할 때 사용.
 *
 * 캐릭터 ID로부터 결정론적인 색상을 만들고, 감정 슬롯마다 약간씩 색을 흔들어서
 * "거의 같지만 조금 다른" 이미지를 생성합니다. 의도적으로 25%는 크게 어긋나게 만들어
 * 일관성 메트릭이 진짜로 변형을 잡아내는지 검증할 수 있도록 합니다.
 */
export class MockGenerator implements Generator {
  readonly name = "mock";

  isConfigured() {
    return true;
  }

  async generateSeed(character: Character): Promise<GenerationResult> {
    const color = hashColor(character.id);
    const buf = await renderTile(360, color, character.name, "seed");
    return {
      characterId: character.id,
      slot: 0,
      emotionLabel: "seed",
      imageBytes: buf,
      generator: this.name,
      latencyMs: 50,
      costUsd: 0,
      promptUsed: character.seed_prompt,
    };
  }

  async generateVariant(req: GenerationRequest): Promise<GenerationResult> {
    const base = hashColor(req.character.id);
    // 25% 확률로 크게 빗나간 색을 사용 → 메트릭 검증용 인위적 실패
    const dramatic = req.emotion.slot % 4 === 0;
    const color = dramatic ? jitterColor(base, 80) : jitterColor(base, 8);

    const buf = await renderTile(
      req.size ?? 360,
      color,
      req.character.name,
      req.emotion.label
    );
    return {
      characterId: req.character.id,
      slot: req.emotion.slot,
      emotionLabel: req.emotion.label,
      imageBytes: buf,
      generator: this.name,
      latencyMs: 30,
      costUsd: 0,
      promptUsed: req.emotion.action,
    };
  }
}

function hashColor(id: string): { r: number; g: number; b: number } {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    r: 80 + (h & 0xff) % 140,
    g: 80 + ((h >> 8) & 0xff) % 140,
    b: 80 + ((h >> 16) & 0xff) % 140,
  };
}

function jitterColor(
  c: { r: number; g: number; b: number },
  amount: number
): { r: number; g: number; b: number } {
  const j = () => Math.floor((Math.random() - 0.5) * amount * 2);
  return {
    r: clamp(c.r + j()),
    g: clamp(c.g + j()),
    b: clamp(c.b + j()),
  };
}

function clamp(v: number) {
  return Math.max(0, Math.min(255, v));
}

async function renderTile(
  size: number,
  color: { r: number; g: number; b: number },
  characterName: string,
  label: string
): Promise<Buffer> {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="rgb(${color.r},${color.g},${color.b})" rx="40" />
    <circle cx="${size / 2}" cy="${size * 0.4}" r="${size * 0.18}" fill="rgba(0,0,0,0.15)" />
    <text x="50%" y="62%" font-family="sans-serif" font-size="${size * 0.08}"
          fill="white" text-anchor="middle" font-weight="700">${escapeXml(characterName)}</text>
    <text x="50%" y="78%" font-family="sans-serif" font-size="${size * 0.07}"
          fill="white" text-anchor="middle">${escapeXml(label)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!
  );
}
