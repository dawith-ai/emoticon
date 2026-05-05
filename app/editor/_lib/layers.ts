/**
 * 레이어 시스템 — 이비스페인트의 무제한 레이어를 카카오 이모티콘 제작에 맞춰 3개로 압축.
 *
 * 카카오 이모티콘 제작 표준 워크플로:
 *   1. 스케치 (연필) → 채색 → 선화 (G펜) 순서가 보통
 *   2. 텍스트는 별도 레이어가 깔끔
 *
 * 3개 기본 레이어 + 사용자 추가 가능 (최대 6개).
 */

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  /** 0~1 */
  opacity: number;
  /** 다른 레이어와 혼합 모드 */
  blendMode: GlobalCompositeOperation;
  /** 클리핑 마스크 - 아래 레이어 픽셀이 있는 곳에만 그려짐 */
  clipped: boolean;
  /** 잠금 - 편집 불가 */
  locked: boolean;
};

export const DEFAULT_LAYERS: Layer[] = [
  {
    id: "lineart",
    name: "선화",
    visible: true,
    opacity: 1.0,
    blendMode: "source-over",
    clipped: false,
    locked: false,
  },
  {
    id: "color",
    name: "채색",
    visible: true,
    opacity: 1.0,
    blendMode: "source-over",
    clipped: false,
    locked: false,
  },
  {
    id: "background",
    name: "배경",
    visible: true,
    opacity: 1.0,
    blendMode: "source-over",
    clipped: false,
    locked: false,
  },
];

export const MAX_LAYERS = 6;
