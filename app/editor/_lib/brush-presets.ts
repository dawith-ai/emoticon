/**
 * 브러시 프리셋 — 이비스페인트 핵심 4종을 카카오 이모티콘 제작 컨텍스트에 맞춰 압축.
 *
 * 카카오 이모티콘은 "두꺼운 검정 외곽선 + 평면 채색"이 압도적으로 흔해서
 * G펜(외곽선용) / 연필(스케치용) / 마커(채색용) / 에어브러시(그라디언트용) 4종이면 95% 커버.
 */

export type BrushKind = "g-pen" | "pencil" | "marker" | "airbrush";

export type BrushPreset = {
  id: BrushKind;
  label: string;
  emoji: string;
  description: string;
  /** 권장 두께 범위 */
  sizeRange: [number, number];
  defaultSize: number;
  /** 기본 alpha (0~1) */
  alpha: number;
  /** Canvas blend mode */
  composite: GlobalCompositeOperation;
  /** stroke마다 점 사이를 보간할 때 sub-step 간격(px) */
  stepPx: number;
  /** 스트로크 끝부분이 부드러운지 (round) vs 거친지 (butt) */
  cap: CanvasLineCap;
  /** 손떨림 보정 권장값 (0-5) */
  recommendedStabilizer: number;
};

export const BRUSH_PRESETS: BrushPreset[] = [
  {
    id: "g-pen",
    label: "G펜",
    emoji: "🖋️",
    description: "이모티콘 외곽선 전용. 단단하고 일정한 검정선.",
    sizeRange: [2, 16],
    defaultSize: 6,
    alpha: 1.0,
    composite: "source-over",
    stepPx: 1,
    cap: "round",
    recommendedStabilizer: 3,
  },
  {
    id: "pencil",
    label: "연필",
    emoji: "✏️",
    description: "초안 스케치용. 텍스처가 살짝 있는 흐릿한 선.",
    sizeRange: [1, 8],
    defaultSize: 3,
    alpha: 0.5,
    composite: "source-over",
    stepPx: 2,
    cap: "round",
    recommendedStabilizer: 1,
  },
  {
    id: "marker",
    label: "마커",
    emoji: "🖍️",
    description: "넓은 면 채색용. 겹치면 진해지는 반투명.",
    sizeRange: [10, 60],
    defaultSize: 24,
    alpha: 0.45,
    composite: "multiply",
    stepPx: 4,
    cap: "round",
    recommendedStabilizer: 2,
  },
  {
    id: "airbrush",
    label: "에어브러시",
    emoji: "💨",
    description: "볼터치/그라디언트용. 가장자리가 부드러움.",
    sizeRange: [10, 80],
    defaultSize: 32,
    alpha: 0.15,
    composite: "source-over",
    stepPx: 2,
    cap: "round",
    recommendedStabilizer: 0,
  },
];

export function getPreset(kind: BrushKind): BrushPreset {
  return BRUSH_PRESETS.find((p) => p.id === kind) ?? BRUSH_PRESETS[0];
}

/**
 * 브러시별 stroke 스타일 적용. ctx 상태를 미리 저장/복원해서 호출하세요.
 */
export function applyBrushStyle(
  ctx: CanvasRenderingContext2D,
  preset: BrushPreset,
  color: string,
  size: number
): void {
  ctx.lineCap = preset.cap;
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = preset.composite;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.globalAlpha = preset.alpha;

  if (preset.id === "airbrush") {
    // 에어브러시: shadowBlur로 부드러운 가장자리
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.6;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }
}
