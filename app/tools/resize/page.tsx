"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  PLATFORM_RESIZE_SPECS,
  resizeImage,
  canvasToPng,
  type FitMode,
  type PlatformSpec,
} from "../_lib/resize";
import { compressPngTo, KAKAO_STATIC_MAX_BYTES } from "../_lib/compress";

type PreviewBg = "checker" | "light" | "dark";

const BG_STYLE: Record<PreviewBg, React.CSSProperties> = {
  checker: {
    backgroundImage:
      "linear-gradient(45deg, #e8e8e8 25%, transparent 25%), linear-gradient(-45deg, #e8e8e8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8e8e8 75%), linear-gradient(-45deg, transparent 75%, #e8e8e8 75%)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
    backgroundColor: "#ffffff",
  },
  light: { backgroundColor: "#ffffff" },
  dark: { backgroundColor: "#111827" },
};

type SourceImage = {
  file: File;
  url: string;
  el: HTMLImageElement;
  baseName: string;
};

async function loadImage(file: File): Promise<SourceImage> {
  const url = URL.createObjectURL(file);
  const el = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  return {
    file,
    url,
    el,
    baseName: file.name.replace(/\.[^.]+$/, "") || "image",
  };
}

export default function ResizeToolPage() {
  const [sources, setSources] = useState<SourceImage[]>([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<Set<string>>(
    new Set(["kakao-static"]),
  );
  const [fitMode, setFitMode] = useState<FitMode>("contain");
  const [bg, setBg] = useState<PreviewBg>("checker");
  const [busy, setBusy] = useState(false);
  const [kakaoCompress, setKakaoCompress] = useState(true);
  const [compressLog, setCompressLog] = useState<string[]>([]);
  const [zipReady, setZipReady] = useState<{ url: string; size: number; count: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 정리
  useEffect(() => {
    return () => {
      sources.forEach((s) => URL.revokeObjectURL(s.url));
      if (zipReady) URL.revokeObjectURL(zipReady.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) =>
      /image\/(png|webp|jpeg)/.test(f.type),
    );
    if (arr.length === 0) return;
    const loaded = await Promise.all(arr.map(loadImage));
    setSources((prev) => [...prev, ...loaded]);
    setZipReady(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    void onFiles(e.dataTransfer.files);
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatformIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setZipReady(null);
  };

  const removeSource = (idx: number) => {
    setSources((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
    setZipReady(null);
  };

  const selectedPlatforms: PlatformSpec[] = useMemo(
    () =>
      PLATFORM_RESIZE_SPECS.filter((p) => selectedPlatformIds.has(p.id)),
    [selectedPlatformIds],
  );

  const totalOutputs = useMemo(
    () =>
      sources.length *
      selectedPlatforms.reduce((s, p) => s + p.targets.length, 0),
    [sources, selectedPlatforms],
  );

  const buildZip = async () => {
    if (sources.length === 0 || selectedPlatforms.length === 0) return;
    setBusy(true);
    setCompressLog([]);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const log: string[] = [];

      for (const src of sources) {
        for (const platform of selectedPlatforms) {
          const dir = zip.folder(platform.id) || zip;
          const useKakaoCompress =
            kakaoCompress && platform.id === "kakao-static";
          for (const target of platform.targets) {
            const canvas = resizeImage(src.el, target, fitMode);
            let blob: Blob;
            if (useKakaoCompress) {
              const result = await compressPngTo(canvas, KAKAO_STATIC_MAX_BYTES);
              blob = result.blob;
              log.push(
                `${src.baseName} → ${target.id}: ${(blob.size / 1024).toFixed(1)}KB ` +
                  `(레벨 ${result.level}, RGB ${result.rgbBits}비트${
                    result.alphaThreshold ? `, α≥${result.alphaThreshold}` : ""
                  }${result.satisfied ? "" : " — 150KB 초과"})`,
              );
            } else {
              blob = await canvasToPng(canvas);
            }
            const filename = `${src.baseName}_${target.id}_${target.width}x${target.height}.png`;
            dir.file(filename, blob);
          }
        }
      }

      setCompressLog(log);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      setZipReady({ url, size: blob.size, count: totalOutputs });
    } catch (err) {
      console.error(err);
      alert("ZIP 생성에 실패했어요. 콘솔을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = () => {
    if (!zipReady) return;
    const a = document.createElement("a");
    a.href = zipReady.url;
    a.download = `vibemoji-resize-${Date.now()}.zip`;
    a.click();
  };

  const downloadSinglePng = async (
    src: SourceImage,
    platform: PlatformSpec,
  ) => {
    const target = platform.targets[0];
    const canvas = resizeImage(src.el, target, fitMode);
    const blob = await canvasToPng(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${src.baseName}_${target.id}_${target.width}x${target.height}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const reset = () => {
    sources.forEach((s) => URL.revokeObjectURL(s.url));
    if (zipReady) URL.revokeObjectURL(zipReady.url);
    setSources([]);
    setZipReady(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">📐 이모티콘 사이즈 자동 변환기</h1>
          <Link href="/tools" className="btn btn-ghost btn-xs">
            ← 도구 목록
          </Link>
        </div>
        <p className="mt-1 text-sm text-base-content/70">
          PNG 한 장 또는 여러 장을 한 번에 카카오 4종·OGQ·라인 2종·비트윈·Etsy
          등 9개 플랫폼 규격으로 변환해 ZIP으로 다운로드해요.
        </p>
      </div>

      <label
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-base-300 bg-base-100 p-4 text-center transition hover:border-primary hover:bg-primary/5"
      >
        <span className="text-3xl">📥</span>
        <p className="mt-1 text-sm font-medium">
          PNG 선택 또는 여기에 드래그 (다중 선택 가능)
        </p>
        <p className="text-xs text-base-content/60">
          배경이 투명한 PNG를 권장해요
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      {sources.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          {/* 좌: 업로드 미리보기 + 변환 결과 미리보기 */}
          <div className="space-y-3">
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">
                    업로드 ({sources.length})
                  </h3>
                  <button onClick={reset} className="btn btn-ghost btn-xs">
                    전체 비우기
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {sources.map((s, i) => (
                    <div key={s.url} className="group relative">
                      <div
                        className="aspect-square w-full overflow-hidden rounded-lg"
                        style={BG_STYLE[bg]}
                      >
                        <img
                          src={s.url}
                          alt={s.baseName}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <p className="mt-1 truncate text-[10px] text-base-content/70">
                        {s.baseName}
                      </p>
                      <p className="text-[9px] text-base-content/50">
                        {s.el.naturalWidth}×{s.el.naturalHeight}
                      </p>
                      <button
                        onClick={() => removeSource(i)}
                        className="absolute right-1 top-1 hidden h-5 w-5 rounded-full bg-error/90 text-xs text-white group-hover:block"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 첫 번째 이미지 기준 변환 미리보기 */}
            {sources[0] && selectedPlatforms.length > 0 && (
              <div className="card border border-base-300 bg-base-100">
                <div className="card-body p-3">
                  <h3 className="text-sm font-bold">
                    변환 미리보기 — {sources[0].baseName}.png
                  </h3>
                  <div className="mt-2 space-y-3">
                    {selectedPlatforms.map((p) => (
                      <PlatformPreview
                        key={p.id}
                        platform={p}
                        source={sources[0]}
                        fitMode={fitMode}
                        bg={bg}
                        onSingleDownload={() => downloadSinglePng(sources[0], p)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 우: 플랫폼/옵션 패널 */}
          <aside className="card border border-base-300 bg-base-100">
            <div className="card-body space-y-3 p-3">
              <div>
                <h3 className="text-sm font-bold">플랫폼 선택</h3>
                <p className="text-[10px] text-base-content/60">
                  여러 개를 한 번에 변환할 수 있어요
                </p>
                <div className="mt-2 space-y-1">
                  {PLATFORM_RESIZE_SPECS.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-base-300 p-2 text-xs hover:bg-base-200"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlatformIds.has(p.id)}
                        onChange={() => togglePlatform(p.id)}
                        className="checkbox checkbox-xs checkbox-primary mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="font-bold">
                          {p.emoji} {p.name}
                        </div>
                        <div className="text-[10px] text-base-content/60">
                          {p.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="divider my-1"></div>

              <div>
                <label className="label py-1 text-xs font-bold">
                  비율 모드
                </label>
                <div className="flex gap-1">
                  <button
                    className={`btn btn-xs flex-1 ${fitMode === "contain" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setFitMode("contain")}
                  >
                    여백
                  </button>
                  <button
                    className={`btn btn-xs flex-1 ${fitMode === "cover" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setFitMode("cover")}
                  >
                    꽉 채움
                  </button>
                  <button
                    className={`btn btn-xs flex-1 ${fitMode === "stretch" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setFitMode("stretch")}
                  >
                    늘림
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-base-content/60">
                  {fitMode === "contain" &&
                    "비율 유지 + 투명 패딩 (이모티콘 권장)"}
                  {fitMode === "cover" && "비율 유지 + 잘라내기"}
                  {fitMode === "stretch" && "비율 무시 + 늘려서 채움"}
                </p>
              </div>

              <div>
                <label className="label cursor-pointer py-1 text-xs">
                  <span className="label-text">
                    🗜️ 카카오 ≤150KB 자동 압축
                  </span>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-xs"
                    checked={kakaoCompress}
                    onChange={(e) => {
                      setKakaoCompress(e.target.checked);
                      setZipReady(null);
                    }}
                  />
                </label>
                <p className="text-[10px] text-base-content/60">
                  카카오 멈춤 변환에만 적용 — RGB 비트 양자화로 단계별 압축. 다른 플랫폼은 원본 PNG 그대로.
                </p>
              </div>

              <div>
                <label className="label py-1 text-xs font-bold">미리보기 배경</label>
                <div className="flex gap-1">
                  <button
                    className={`btn btn-xs flex-1 ${bg === "checker" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setBg("checker")}
                  >
                    체커
                  </button>
                  <button
                    className={`btn btn-xs flex-1 ${bg === "light" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setBg("light")}
                  >
                    밝게
                  </button>
                  <button
                    className={`btn btn-xs flex-1 ${bg === "dark" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setBg("dark")}
                  >
                    어둡게
                  </button>
                </div>
              </div>

              <div className="divider my-1"></div>

              <div className="rounded-lg bg-base-200 p-2 text-xs">
                <div>
                  📦 출력 파일: <strong>{totalOutputs}개</strong>
                </div>
                <div className="text-[10px] text-base-content/60">
                  ({sources.length} 입력 ×{" "}
                  {selectedPlatforms.reduce((s, p) => s + p.targets.length, 0)}{" "}
                  타겟)
                </div>
              </div>

              {!zipReady ? (
                <button
                  onClick={buildZip}
                  disabled={
                    busy || sources.length === 0 || selectedPlatforms.length === 0
                  }
                  className="btn btn-primary btn-sm"
                >
                  {busy ? "변환 중..." : "📦 ZIP 생성"}
                </button>
              ) : (
                <>
                  <button onClick={downloadZip} className="btn btn-primary btn-sm">
                    ⬇ ZIP 다운로드 ({(zipReady.size / 1024).toFixed(0)} KB)
                  </button>
                  <button
                    onClick={() => setZipReady(null)}
                    className="btn btn-ghost btn-xs"
                  >
                    옵션 다시 변경
                  </button>
                </>
              )}

              {compressLog.length > 0 && (
                <details className="mt-2 text-[10px]">
                  <summary className="cursor-pointer text-base-content/60">
                    🗜️ 카카오 압축 로그 ({compressLog.length})
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-base-200 p-2">
                    {compressLog.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          </aside>
        </div>
      )}

      <div className="alert text-xs">
        ℹ️ 모든 변환은 브라우저에서만 처리돼요. 서버에 이미지가 올라가지 않습니다.
      </div>
    </div>
  );
}

function PlatformPreview({
  platform,
  source,
  fitMode,
  bg,
  onSingleDownload,
}: {
  platform: PlatformSpec;
  source: SourceImage;
  fitMode: FitMode;
  bg: PreviewBg;
  onSingleDownload: () => void;
}) {
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    for (const target of platform.targets) {
      const c = canvasRefs.current.get(target.id);
      if (!c) continue;
      const out = resizeImage(source.el, target, fitMode);
      c.width = out.width;
      c.height = out.height;
      const ctx = c.getContext("2d");
      ctx?.drawImage(out, 0, 0);
    }
  }, [platform, source, fitMode]);

  return (
    <div className="rounded-lg border border-base-300 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold">
          {platform.emoji} {platform.name}
        </span>
        {platform.targets.length === 1 && (
          <button
            onClick={onSingleDownload}
            className="btn btn-ghost btn-xs"
            title="이 사이즈만 PNG 다운로드"
          >
            ⬇ PNG
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {platform.targets.map((t) => (
          <div key={t.id} className="text-center">
            <div
              className="overflow-hidden rounded border border-base-300"
              style={{
                ...BG_STYLE[bg],
                width: Math.min(t.width, 120),
                height: Math.min(t.height, 120),
              }}
            >
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(t.id, el);
                }}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <p className="mt-0.5 text-[9px] text-base-content/70">
              {t.label} · {t.width}×{t.height}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
