"use client";

/**
 * 애니메이션 진행 상태/미리보기 카드.
 * - 진행률 표시
 * - 완료 시 video 미리보기 + MP4 다운로드 버튼
 */

interface AnimateCardProps {
  status:
    | "idle"
    | "uploading"
    | "starting"
    | "processing"
    | "succeeded"
    | "failed"
    | "canceled";
  progress: number | null; // 0~1
  attempt: number;
  videoUrl: string | null;
  errorMessage: string | null;
  onDownload: () => void;
  onCancel?: () => void;
  onReset?: () => void;
}

const STATUS_LABEL: Record<AnimateCardProps["status"], string> = {
  idle: "대기 중",
  uploading: "이미지 업로드 중",
  starting: "Replicate에 작업 등록 중",
  processing: "프레임 생성 중 (보통 1~3분)",
  succeeded: "완료!",
  failed: "실패",
  canceled: "취소됨",
};

export function AnimateCard({
  status,
  progress,
  attempt,
  videoUrl,
  errorMessage,
  onDownload,
  onCancel,
  onReset,
}: AnimateCardProps) {
  const pct = progress != null ? Math.round(progress * 100) : null;
  const showSpinner =
    status === "uploading" || status === "starting" || status === "processing";

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="card-title text-lg">🎬 생성 진행 상황</h3>
          <span
            className={`badge ${
              status === "succeeded"
                ? "badge-success"
                : status === "failed" || status === "canceled"
                  ? "badge-error"
                  : "badge-info"
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        {showSpinner && (
          <div className="space-y-2">
            <progress
              className="progress progress-primary w-full"
              value={pct ?? undefined}
              max={100}
            />
            <p className="text-xs text-base-content/60">
              {pct != null ? `${pct}% · ` : ""}
              폴링 시도 #{attempt}
              {pct == null && " (서버 진행률 정보 없음 — 잠시만 기다려 주세요)"}
            </p>
          </div>
        )}

        {status === "succeeded" && videoUrl && (
          <div className="space-y-2">
            <video
              src={videoUrl}
              controls
              loop
              autoPlay
              muted
              playsInline
              className="w-full rounded-lg border border-base-300"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDownload}
                className="btn btn-primary btn-sm"
              >
                ⬇ MP4 다운로드
              </button>
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="btn btn-ghost btn-sm"
                >
                  새로 만들기
                </button>
              )}
            </div>
            <p className="text-xs text-base-content/60">
              GIF 변환은 다음 업데이트 예정 — 지금은 MP4만 받을 수 있어요.
              필요하시면 ezgif.com 같은 외부 변환기로 GIF로 만들 수 있어요.
            </p>
          </div>
        )}

        {(status === "failed" || status === "canceled") && (
          <div className="space-y-2">
            <p className="text-sm text-error">
              {errorMessage ?? "알 수 없는 오류가 발생했어요"}
            </p>
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="btn btn-outline btn-sm"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {showSpinner && onCancel && (
          <div>
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-ghost btn-xs"
            >
              ⏹ 취소
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
