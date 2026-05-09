"use client";

/**
 * 정적 → 움직이는 이모티콘 (Image-to-Video) 페이지.
 *
 * 흐름:
 *   1) 이미지 1장 업로드 (drag/drop or file picker)
 *   2) 동작 프롬프트 (선택) + 모델 선택 (Wan Fast / Kling)
 *   3) BYOK Replicate 토큰 확인 (없으면 인라인 입력 UI)
 *   4) "애니메이션 생성" → 폴링 → MP4 미리보기 + 다운로드
 *
 * 모든 이미지/토큰은 사용자 브라우저에서만 보관. 운영자 비용 0.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimateCard, type GifConvertStatus } from "@/components/AnimateCard";
import {
  clearReplicateByok,
  getReplicateByok,
  isValidReplicateKey,
  maskReplicateKey,
  setReplicateByok,
} from "@/lib/byok-replicate";
import {
  downloadAsBlob,
  pollAnimationStatus,
  startAnimation,
  type AnimateModel,
  type AnimateProgress,
} from "@/lib/ai/i2v";

type RunStatus =
  | "idle"
  | "uploading"
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

const PROMPT_PRESETS = [
  "subtle natural motion, gentle expression change, looped, soft idle animation",
  "character bounces gently, big smile, looped",
  "character waves hand happily, looped",
  "character shakes head slowly, sad expression, looped",
  "character winks one eye, playful vibe, looped",
];

const MODEL_OPTIONS: ReadonlyArray<{
  key: AnimateModel;
  label: string;
  price: string;
  desc: string;
}> = [
  {
    key: "wan-fast",
    label: "Wan 2.2 i2v Fast",
    price: "≈ $0.05 / 클립",
    desc: "5초·480p, 가장 저렴. MVP 추천.",
  },
  {
    key: "kling",
    label: "Kling v2.0",
    price: "≈ $0.30 / 클립",
    desc: "프레임 품질 우수, 좀 더 비쌈.",
  },
];

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

export default function AnimatePage() {
  // 입력
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>(PROMPT_PRESETS[0]);
  const [model, setModel] = useState<AnimateModel>("wan-fast");
  const [seedInput, setSeedInput] = useState<string>("");

  // 진행
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);

  // BYOK
  const [byokInput, setByokInput] = useState<string>("");
  const [byokConsent, setByokConsent] = useState<boolean>(false);
  const [byokView, setByokView] = useState<{ hasKey: boolean; masked: string }>({
    hasKey: false,
    masked: "",
  });
  const [byokError, setByokError] = useState<string | null>(null);

  // GIF 변환 (카카오 규격)
  const [gifStatus, setGifStatus] = useState<GifConvertStatus>("idle");
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifBytes, setGifBytes] = useState<number | null>(null);
  const [gifError, setGifError] = useState<string | null>(null);
  const gifAbortRef = useRef<AbortController | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const dragCounterRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const refreshByokView = () => {
    const { key, consented } = getReplicateByok();
    setByokView({
      hasKey: !!key && consented && isValidReplicateKey(key),
      masked: key ? maskReplicateKey(key) : "",
    });
  };

  useEffect(() => {
    refreshByokView();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // GIF objectURL 회수 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
  }, [gifUrl]);

  const canGenerate = useMemo(() => {
    if (!file) return false;
    if (!byokView.hasKey) return false;
    if (
      runStatus === "uploading" ||
      runStatus === "starting" ||
      runStatus === "processing"
    ) {
      return false;
    }
    return true;
  }, [file, byokView.hasKey, runStatus]);

  const handleFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErrorMsg("이미지 파일만 올릴 수 있어요 (PNG/JPG/WebP).");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setErrorMsg(
        `파일이 너무 커요 (${(f.size / 1024 / 1024).toFixed(1)}MB). ${MAX_FILE_BYTES / 1024 / 1024}MB 이하로 올려 주세요.`,
      );
      return;
    }
    setErrorMsg(null);
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
    }
  };
  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const saveByokInline = () => {
    const trimmed = byokInput.trim();
    if (!isValidReplicateKey(trimmed)) {
      setByokError("Replicate 토큰 형식이 올바르지 않아요. 'r8_'로 시작해야 해요.");
      return;
    }
    if (!byokConsent) {
      setByokError("약관에 동의해 주세요.");
      return;
    }
    setReplicateByok(trimmed, true);
    setByokInput("");
    setByokError(null);
    refreshByokView();
  };

  const removeByok = () => {
    clearReplicateByok();
    refreshByokView();
  };

  const generate = async () => {
    if (!file) return;
    setErrorMsg(null);
    setVideoUrl(null);
    setProgress(null);
    setAttempt(0);
    setPredictionId(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      setRunStatus("uploading");
      const seedNum = (() => {
        const t = seedInput.trim();
        if (!t) return undefined;
        const n = Number(t);
        return Number.isFinite(n) ? n : undefined;
      })();

      setRunStatus("starting");
      const id = await startAnimation(file, {
        prompt: prompt.trim() || undefined,
        seed: seedNum,
        model,
      });
      setPredictionId(id);
      setRunStatus("processing");

      const url = await pollAnimationStatus(
        id,
        (p: AnimateProgress) => {
          setProgress(p.progress);
          setAttempt(p.attempt);
        },
        { signal: ctrl.signal },
      );
      setVideoUrl(url);
      setRunStatus("succeeded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setErrorMsg(msg);
      setRunStatus(ctrl.signal.aborted ? "canceled" : "failed");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const reset = () => {
    abortRef.current?.abort();
    gifAbortRef.current?.abort();
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setVideoUrl(null);
    setErrorMsg(null);
    setRunStatus("idle");
    setProgress(null);
    setAttempt(0);
    setPredictionId(null);
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    setGifUrl(null);
    setGifBytes(null);
    setGifStatus("idle");
    setGifProgress(null);
    setGifError(null);
  };

  const downloadMp4 = async () => {
    if (!videoUrl) return;
    try {
      const blob = await downloadAsBlob(videoUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (file?.name ?? "vibemoji").replace(/\.[^.]+$/, "");
      a.download = `${safe}_animated.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "다운로드 실패";
      setErrorMsg(msg);
    }
  };

  /**
   * 카카오 "움직이는 이모티콘" 규격(360x360 · 24fps · 1초 · 무한루프)으로
   * MP4 → GIF 변환. ffmpeg.wasm은 이벤트 핸들러 안에서 동적 import 되므로
   * SSR에서 wasm이 로드될 위험이 없다.
   */
  const convertToKakaoGif = async () => {
    if (!videoUrl) return;
    if (gifUrl) {
      URL.revokeObjectURL(gifUrl);
      setGifUrl(null);
      setGifBytes(null);
    }
    setGifError(null);
    setGifProgress(0);
    setGifStatus("converting");

    gifAbortRef.current?.abort();
    const ctrl = new AbortController();
    gifAbortRef.current = ctrl;

    try {
      // 동적 import: 첫 호출 시 ~30MB wasm을 받지만 같은 페이지에선 캐시.
      const { convertMp4ToGif } = await import("@/lib/ai/gif-convert");
      // Replicate CDN의 MP4를 먼저 Blob으로 받은 뒤 ffmpeg에 넘긴다.
      // (URL을 그대로 넘겨도 fetchFile이 처리하지만, 이미 동일 함수를 쓰는
      //  downloadAsBlob 경로와 일관성을 위해 Blob으로 받음.)
      const mp4Blob = await downloadAsBlob(videoUrl);
      const gif = await convertMp4ToGif(mp4Blob, {
        width: 360,
        height: 360,
        fps: 24,
        duration: 1,
        signal: ctrl.signal,
        onProgress: (r) => setGifProgress(r),
      });
      const url = URL.createObjectURL(gif);
      setGifUrl(url);
      setGifBytes(gif.size);
      setGifProgress(1);
      setGifStatus("succeeded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "GIF 변환 실패";
      setGifError(msg);
      setGifStatus("failed");
    }
  };

  const downloadGif = () => {
    if (!gifUrl) return;
    const a = document.createElement("a");
    a.href = gifUrl;
    const safe = (file?.name ?? "vibemoji").replace(/\.[^.]+$/, "");
    a.download = `${safe}_kakao_360.gif`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">🎬 움직이는 이모티콘 만들기</h1>
          <span className="badge badge-secondary">Beta · I2V</span>
        </div>
        <p className="text-sm text-base-content/70">
          정적 이미지 한 장을 짧은 동영상 클립(보통 5초)으로 변환해요.
          카카오 “움직이는 이모티콘” 가격은 정적 대비 1.5~2배 — 큰 시장 기회예요.
        </p>
      </header>

      {/* BYOK 안내 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-2">
          <h2 className="card-title text-base">🔑 Replicate 토큰 (BYOK)</h2>
          {byokView.hasKey ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                등록된 키: <code className="font-mono">{byokView.masked}</code>
              </p>
              <button
                type="button"
                onClick={removeByok}
                className="btn btn-ghost btn-xs"
              >
                삭제
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-base-content/70">
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-primary"
                >
                  replicate.com/account/api-tokens
                </a>
                에서 토큰을 만들어 붙여넣어 주세요. 토큰은 브라우저 localStorage에만
                저장되며 서버는 요청 시에만 헤더로 전달받고 저장하지 않아요.
              </p>
              <input
                type="password"
                value={byokInput}
                onChange={(e) => setByokInput(e.target.value)}
                placeholder="r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="input input-bordered w-full font-mono text-sm"
                autoComplete="off"
              />
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={byokConsent}
                  onChange={(e) => setByokConsent(e.target.checked)}
                />
                <span className="label-text text-xs">
                  본인 토큰 사용 및 브라우저 보관에 동의합니다.
                </span>
              </label>
              {byokError && <p className="text-xs text-error">{byokError}</p>}
              <button
                type="button"
                onClick={saveByokInline}
                className="btn btn-primary btn-sm"
                disabled={!byokInput.trim() || !byokConsent}
              >
                토큰 저장
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 업로드 + 옵션 */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-2">
            <h2 className="card-title text-base">1. 정적 이모티콘 업로드</h2>
            <label
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-base-300 hover:border-primary/60"
              }`}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="업로드한 이모티콘 미리보기"
                  className="max-h-56 rounded-md object-contain"
                />
              ) : (
                <>
                  <p className="text-sm font-medium">
                    여기에 이미지 드래그 또는 클릭해서 선택
                  </p>
                  <p className="mt-1 text-xs text-base-content/60">
                    PNG/JPG/WebP · 최대 8MB · 정사각형 권장
                  </p>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <p className="text-xs text-base-content/60">
                선택됨: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-3">
            <h2 className="card-title text-base">2. 동작 프롬프트 / 모델</h2>

            <div>
              <label className="label py-1">
                <span className="label-text text-sm">동작 묘사 (영문 권장)</span>
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="textarea textarea-bordered w-full font-mono text-xs"
                placeholder="예: subtle natural motion, gentle expression change, looped"
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {PROMPT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="badge badge-outline badge-sm cursor-pointer hover:badge-primary"
                  >
                    {p.length > 28 ? `${p.slice(0, 28)}…` : p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label py-1">
                <span className="label-text text-sm">모델</span>
              </label>
              <div className="grid gap-2">
                {MODEL_OPTIONS.map((m) => (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${
                      model === m.key
                        ? "border-primary bg-primary/5"
                        : "border-base-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="i2v-model"
                      className="radio radio-sm radio-primary mt-0.5"
                      checked={model === m.key}
                      onChange={() => setModel(m.key)}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {m.label}{" "}
                        <span className="text-xs text-base-content/60">
                          {m.price}
                        </span>
                      </p>
                      <p className="text-xs text-base-content/60">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label py-1">
                <span className="label-text text-sm">시드 (선택)</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                className="input input-bordered input-sm w-40 font-mono"
                placeholder="예: 42"
              />
              <p className="mt-1 text-xs text-base-content/60">
                같은 시드 + 같은 입력이면 비슷한 결과가 나와요.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 실행 버튼 */}
      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className="btn btn-primary"
        >
          🎬 애니메이션 생성
        </button>
        {!byokView.hasKey && (
          <span className="text-xs text-warning">
            먼저 Replicate 토큰을 등록해 주세요.
          </span>
        )}
        {!file && byokView.hasKey && (
          <span className="text-xs text-base-content/60">
            이미지를 업로드해 주세요.
          </span>
        )}
        {predictionId && (
          <span className="text-xs text-base-content/50 font-mono">
            id: {predictionId.slice(0, 12)}…
          </span>
        )}
      </section>

      {/* 에러 박스 */}
      {errorMsg && runStatus !== "failed" && runStatus !== "canceled" && (
        <div className="alert alert-error">
          <span className="text-sm">{errorMsg}</span>
        </div>
      )}

      {/* 진행 상태 카드 */}
      {runStatus !== "idle" && (
        <AnimateCard
          status={runStatus}
          progress={progress}
          attempt={attempt}
          videoUrl={videoUrl}
          errorMessage={errorMsg}
          onDownload={downloadMp4}
          onCancel={cancel}
          onReset={reset}
          gifStatus={gifStatus}
          gifProgress={gifProgress}
          gifUrl={gifUrl}
          gifBytes={gifBytes}
          gifError={gifError}
          onConvertGif={convertToKakaoGif}
          onDownloadGif={downloadGif}
        />
      )}

      {/* 카카오 사양 안내 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-2">
          <h2 className="card-title text-base">📋 카카오 움직이는 이모티콘 사양</h2>
          <ul className="ml-4 list-disc space-y-1 text-sm text-base-content/70">
            <li>해상도: <strong>360 × 360 px</strong></li>
            <li>프레임 수: <strong>24프레임 이하</strong> (0.04초 / 프레임 기준 약 1초)</li>
            <li>형식: <strong>GIF</strong> (투명 배경 권장)</li>
            <li>제출 단위: 24개 (전체 움직이는 이모티콘 제안 시)</li>
          </ul>
          <p className="text-xs text-base-content/60">
            생성 완료 후 <strong>🎁 카카오 GIF로 변환</strong> 버튼을 누르면
            브라우저에서 ffmpeg.wasm으로 360×360·24fps·1초 GIF를 즉시 만들어
            드려요. 서버 비용 0, 모든 변환은 사용자 브라우저에서만 처리돼요.
          </p>
          <p className="text-xs">
            <Link href="/tools/resize" className="link link-primary">
              사이즈 변환기
            </Link>
            {" · "}
            <Link href="/generate" className="link link-primary">
              정적 이모티콘 생성기
            </Link>
            로 돌아가기
          </p>
        </div>
      </section>
    </div>
  );
}
