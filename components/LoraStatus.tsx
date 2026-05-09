"use client";

import type { LoraStatusSnapshot } from "@/lib/ai/lora";

type LoraStatusProps = {
  snapshot: LoraStatusSnapshot | null;
  startedAt: number | null;
  trainingId: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  starting: "준비 중",
  queued: "대기열",
  processing: "학습 중",
  succeeded: "완료",
  failed: "실패",
  canceled: "취소됨",
};

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}

export function LoraStatus({ snapshot, startedAt, trainingId }: LoraStatusProps) {
  const status = snapshot?.status ?? "starting";
  const label = STATUS_LABEL[status] ?? status;
  const progress = snapshot ? Math.round(snapshot.progress * 100) : 0;
  const isError = status === "failed" || status === "canceled";

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="card-title text-base">
            학습 상태: <span className={isError ? "text-error" : "text-primary"}>{label}</span>
          </h3>
          <span className="text-xs text-base-content/60">
            경과 {formatElapsed(startedAt)}
          </span>
        </div>

        {trainingId && (
          <div className="text-[11px] text-base-content/60">
            training id: <code className="font-mono">{trainingId}</code>
          </div>
        )}

        <progress
          className={`progress w-full ${isError ? "progress-error" : "progress-primary"}`}
          value={progress}
          max={100}
          aria-label="학습 진행률"
        />
        <div className="text-right text-xs text-base-content/60">{progress}%</div>

        {snapshot?.error && (
          <div className="alert alert-error text-xs">
            <span>오류: {snapshot.error}</span>
          </div>
        )}

        {snapshot?.logsTail && (
          <details className="text-xs">
            <summary className="cursor-pointer text-base-content/70">
              로그 (최근 12줄)
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-base-200 p-2 font-mono text-[11px]">
              {snapshot.logsTail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
