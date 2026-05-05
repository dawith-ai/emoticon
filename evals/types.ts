export type Character = {
  id: string;
  name: string;
  seed_prompt: string;
  features: string[];
  style_keywords?: string[];
  adversarial?: boolean;
  notes?: string;
};

export type Emotion = {
  slot: number;
  label: string;
  action: string;
};

export type GenerationRequest = {
  character: Character;
  emotion: Emotion;
  /** Reference image (시드 이미지) PNG bytes for character consistency */
  referenceImage?: Buffer;
  size?: number;
};

export type GenerationResult = {
  characterId: string;
  slot: number;
  emotionLabel: string;
  imageBytes: Buffer;
  generator: string;
  /** ms */
  latencyMs: number;
  /** USD */
  costUsd?: number;
  promptUsed: string;
};

export interface Generator {
  /** 모델 이름 (e.g. "nano-banana", "mock", "replicate-sdxl") */
  readonly name: string;
  /** API 키 등 환경 준비 여부 */
  isConfigured(): boolean;
  /** 시드 캐릭터 1장 생성 (referenceImage 없는 첫 호출) */
  generateSeed(character: Character): Promise<GenerationResult>;
  /** 시드 + 감정 → 변형 1장 생성 */
  generateVariant(req: GenerationRequest): Promise<GenerationResult>;
}

export type MetricResult = {
  metric: string;
  /** 0.0 ~ 1.0 정규화 점수 (높을수록 좋음) */
  score: number;
  /** 원본 점수 (스케일/단위가 다른 경우) */
  raw?: number;
  /** 사람이 읽을 메모 */
  note?: string;
};

export type StickerEval = {
  characterId: string;
  slot: number;
  emotionLabel: string;
  generator: string;
  variantPath: string;
  seedPath: string;
  metrics: MetricResult[];
  /** 메트릭 가중 평균 */
  aggregateScore: number;
};

export type CharacterEval = {
  characterId: string;
  characterName: string;
  generator: string;
  seedPath: string;
  variants: StickerEval[];
  /** 캐릭터 평균 점수 */
  meanScore: number;
  minScore: number;
  /** 임계치 이하 변형 개수 */
  failureCount: number;
};

export type RunReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  generator: string;
  characters: CharacterEval[];
  /** 전체 평균 */
  overallScore: number;
  totalCostUsd: number;
  passed: boolean;
  thresholds: Record<string, number>;
};
