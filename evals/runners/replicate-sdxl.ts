import type {
  Character,
  Generator,
  GenerationRequest,
  GenerationResult,
} from "../types";

/**
 * Replicate SDXL + LoRA 어댑터 — 정밀 모드용 스텁.
 *
 * 실제 구현 시 흐름:
 *  1. 시드 캐릭터 1장 생성 (text-only)
 *  2. 시드를 다양한 각도로 5-10장 augment
 *  3. Replicate `lora-trainer`로 사용자별 LoRA 학습 (5-10분, $1-3)
 *  4. 학습된 LoRA를 base model + 감정 prompt와 결합해 32장 생성
 *
 * MVP에서는 옵션 1(Nano Banana)로 충분할 가능성이 크므로 P1으로 미룸.
 * 하네스에서는 인터페이스만 잡아두고, 실제 구현은 일관성 점수가
 * 임계 이하일 때 fallback 경로로 활성화.
 */
export class ReplicateSDXLGenerator implements Generator {
  readonly name = "replicate-sdxl-lora";

  isConfigured(): boolean {
    return !!process.env.REPLICATE_API_TOKEN;
  }

  async generateSeed(_character: Character): Promise<GenerationResult> {
    throw new Error(
      "ReplicateSDXLGenerator: P1 미구현. Nano Banana 일관성이 임계 이하일 때 활성화 예정."
    );
  }

  async generateVariant(_req: GenerationRequest): Promise<GenerationResult> {
    throw new Error("ReplicateSDXLGenerator: P1 미구현");
  }
}
