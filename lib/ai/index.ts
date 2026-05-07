/**
 * AI 어댑터 카탈로그 — provider id로 인스턴스 조회.
 *
 * 새 모델 어댑터 추가 시 여기에 한 줄만 추가하면 generate 페이지에서 자동 노출.
 */

import { GeminiDirectGenerator } from "./gemini-direct";
import { PollinationsGenerator } from "./pollinations";
import {
  GEMINI_FREE_INTERVAL_MS,
  POLLINATIONS_INTERVAL_MS,
  Throttle,
} from "./throttle";
import type { AIGenerator, AIProviderId } from "./types";

const REGISTRY: AIGenerator[] = [
  new PollinationsGenerator(),
  new GeminiDirectGenerator(),
];

export function getProvider(id: AIProviderId): AIGenerator | null {
  if (id === "mock") return null;
  return REGISTRY.find((p) => p.id === id) ?? null;
}

export function listProviders(): AIGenerator[] {
  return REGISTRY;
}

/** provider 별로 권장 호출 간격을 알려준다 */
export function intervalFor(id: AIProviderId): number {
  if (id === "gemini") return GEMINI_FREE_INTERVAL_MS;
  if (id === "pollinations") return POLLINATIONS_INTERVAL_MS;
  return 0;
}

/** generate 페이지에서 사용하는 throttle 인스턴스 */
export function makeThrottle(id: AIProviderId): Throttle {
  return new Throttle(intervalFor(id));
}

export type { AIGenerator, AIProviderId, GenerationInput } from "./types";
