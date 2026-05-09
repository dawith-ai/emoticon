"use client";

/**
 * 애니메이션 진행 상태/미리보기 카드.
 * - 진행률 표시
 * - 완료 시 video 미리보기 + MP4 다운로드 버튼
 * - 카카오 규격 GIF(360x360, 24fps, 1초) 변환 버튼 + 진행률 + 미리보기
 */

export type AnimateCardStatus =
  | "idle"
  | "uploading"
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export type GifConvertStatus = "idle" | "converting" | "succeeded" | "failed";

interface AnimateCardProps {
  status: AnimateCardStatus;
  progress: number | null; // 0~1
  attempt: number;
  videoUrl: string | null;
  errorMessage: string | null;
  onDownload: () => void;
  onCancel?: () => void;
  onReset?: () => void;
  // GIF 변환 관련 (옵션 — 부모가 상태 관리)
  gifStatus?: GifConvertStatus;
  gifProgress?: number | null; // 0~1
  gifUrl?: string | null;
  gifBytes?: number | null;
  gifError?: string | null;
  onConvertGif?: () => void;
  onDownloadGif?: () => void;
}

const STATUS_LABEL: Record<AnimateCardStatus, string> = {
  idle: "대기 중",
  uploading: "이미지 업로드 중",
  starting: "Replicate에 작업 등록 중",
  processing: "프레임 생성 중 (보통 1~3분)",
  succeeded: "완료!",
  failed: "실패",
  canceled: "취소됨",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function AnimateCard({
  status,
  progress,
  attempt,
  videoUrl,
  errorMessage,
  onDownload,
  onCancel,
  onReset,
  gifStatus = "idle",
  gifProgress = null,
  gifUrl = null,
  gifBytes = null,
  gifError = null,
  onConvertGif,
  onDownloadGif,
}: AnimateCardProps) {
  const pct = progress != null ? Math.round(progress * 100) : null;
  const showSpinner =
    status === "uploading" || status === "starting" || status === "processing";

  const gifPct =
    gifProgress != null ? Math.round(gifProgress * 100) : null;
  const gifConverting = gifStatus === "converting";
  const gifDone = gifStatus === "succeeded" && gifUrl;

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
          <div className="space-y-3">
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
              {onConvertGif && !gifDone && (
                <button
                  type="button"
                  onClick={onConvertGif}
                  disabled={gifConverting}
                  className="btn btn-secondary btn-sm"
                >
                  {gifConverting
                    ? "🛠 변환 중…"
                    : "🎁 카카오 GIF로 변환 (360x360 · 24fps · 1초)"}
                </button>
              )}
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

            {gifConverting && (
              <div className="space-y-1">
                <progress
                  className="progress progress-secondary w-full"
                  value={gifPct ?? undefined}
                  max={100}
                />
                <p className="text-xs text-base-content/60">
                  {gifPct != null ? `${gifPct}% · ` : ""}
                  ffmpeg.wasm으로 GIF 인코딩 중… 첫 변환은 ~30MB wasm을 받느라
                  10–30초 걸릴 수 있어요. 다음 변환부터는 빨라요.
                </p>
              </div>
            )}

            {gifStatus === "failed" && gifError && (
              <p className="text-xs text-error">GIF 변환 실패: {gifError}</p>
            )}

            {gifDone && (
              <div className="space-y-2 rounded-lg border border-secondary/40 bg-secondary/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    🎁 카카오 규격 GIF 준비 완료
                  </p>
                  <span className="text-xs text-base-content/60">
                    {gifBytes != null ? formatBytes(gifBytes) : ""}
                  </span>
                </div>
                {/* 미리보기는 img 태그로 — 무한 루프 자동 재생 확인 가능 */}
                <img
                  src={gifUrl}
                  alt="변환된 GIF 미리보기"
                  className="mx-auto block max-h-72 rounded-md border border-base-300 bg-white"
                />
                <div className="flex flex-wrap gap-2">
                  {onDownloadGif && (
                    <button
                      type="button"
                      onClick={onDownloadGif}
                      className="btn btn-secondary btn-sm"
                    >
                      ⬇ GIF 다운로드
                    </button>
                  )}
                </div>
                {gifBytes != null && gifBytes > 1024 * 1024 && (
                  <p className="text-xs text-warning">
                    ⚠ 카카오 권장 용량(1MB)을 넘었어요
                    ({formatBytes(gifBytes)}). 필요하면 색상 수나 길이를
                    줄이세요. 최대 허용은 2MB예요.
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-base-content/60">
              GIF 변환은 브라우저 안에서만 처리돼요(서버 비용 0). 첫 실행 시
              ffmpeg.wasm 코어가 한번만 다운로드돼요.
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
