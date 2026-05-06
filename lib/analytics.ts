/**
 * PostHog 분석 — env-gated 클라이언트 통합.
 *
 * - NEXT_PUBLIC_POSTHOG_KEY 미설정 시 모든 호출 noop
 * - 사용자가 쿠키 동의(analytics=true)했을 때만 실제 추적
 * - PostHog SDK는 동적 import로 번들 최소화 (정적 export 호환)
 */
import { readConsent } from "@/components/CookieConsent";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let posthogLoaded = false;
let posthogClient: { capture: (e: string, p?: object) => void; identify: (id: string, p?: object) => void; reset: () => void } | null = null;

async function ensureClient(): Promise<typeof posthogClient> {
  if (typeof window === "undefined") return null;
  if (!KEY) return null;
  const consent = readConsent();
  if (!consent?.analytics) return null;
  if (posthogLoaded) return posthogClient;

  posthogLoaded = true;
  try {
    const mod = await import("posthog-js");
    mod.default.init(KEY, {
      api_host: HOST,
      capture_pageview: false, // App Router에서 수동 트리거
      persistence: "localStorage",
    });
    posthogClient = mod.default as unknown as typeof posthogClient;
  } catch {
    posthogClient = null;
  }
  return posthogClient;
}

export async function trackEvent(name: string, props?: Record<string, unknown>) {
  const client = await ensureClient();
  client?.capture(name, props);
}

export async function identify(userId: string, props?: Record<string, unknown>) {
  const client = await ensureClient();
  client?.identify(userId, props);
}

export async function resetAnalytics() {
  const client = await ensureClient();
  client?.reset();
}
