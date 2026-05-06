/**
 * Sentry 에러 모니터링 — env-gated.
 *
 * NEXT_PUBLIC_SENTRY_DSN 미설정 시 모든 호출 noop.
 * 정적 export 환경에서도 클라이언트 사이드 에러 캡처 동작.
 */
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

let initialized = false;

async function ensure() {
  if (typeof window === "undefined") return null;
  if (!DSN || initialized) return initialized ? (await import("@sentry/browser")).default : null;
  try {
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn: DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_RELEASE ?? "dev",
    });
    initialized = true;
    return Sentry;
  } catch {
    return null;
  }
}

export async function reportError(err: unknown, context?: Record<string, unknown>) {
  const Sentry = await ensure();
  if (!Sentry) {
    console.error("[VibeMoji error]", err, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}
