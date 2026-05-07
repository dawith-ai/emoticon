"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { applyOutline, type OutlineRegion } from "../_lib/outline";

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

export default function OutlineToolPage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("outline");
  const [thickness, setThickness] = useState(6);
  const [bg, setBg] = useState<PreviewBg>("checker");
  const [trackAll, setTrackAll] = useState(true);
  const [region, setRegion] = useState<OutlineRegion | null>(null);
  const [color, setColor] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const onPickFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setImageName(file.name.replace(/\.png$/i, "") || "outline");
    setImageUrl(url);
    setRegion(null);
    setResultUrl(null);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  const onImgLoad = () => {
    setRegion(null);
    runOutline();
  };

  const hexToRgb = (hex: string) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return { r: 255, g: 255, b: 255 };
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16),
    };
  };

  const runOutline = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    setBusy(true);
    // 다음 프레임에 처리 — UI가 "처리 중" 표시할 시간을 준다
    requestAnimationFrame(() => {
      try {
        const canvas = applyOutline(img, {
          thickness,
          color: { ...hexToRgb(color), a: 255 },
          region: trackAll ? undefined : region ?? undefined,
        });
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          setResultUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setBusy(false);
        }, "image/png");
      } catch (err) {
        console.error(err);
        setBusy(false);
      }
    });
  }, [thickness, color, trackAll, region]);

  useEffect(() => {
    if (imageUrl) runOutline();
  }, [thickness, color, trackAll, region, imageUrl, runOutline]);

  // 영역 드래그 (원본 이미지 좌표계로 변환해서 region에 저장)
  const onSourcePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (trackAll) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratioX = img.naturalWidth / rect.width;
    const ratioY = img.naturalHeight / rect.height;
    dragStart.current = {
      x: (e.clientX - rect.left) * ratioX,
      y: (e.clientY - rect.top) * ratioY,
    };
    setRegion({
      x: dragStart.current.x,
      y: dragStart.current.y,
      w: 1,
      h: 1,
    });
  };
  const onSourcePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratioX = img.naturalWidth / rect.width;
    const ratioY = img.naturalHeight / rect.height;
    const cx = (e.clientX - rect.left) * ratioX;
    const cy = (e.clientY - rect.top) * ratioY;
    const x0 = Math.min(dragStart.current.x, cx);
    const y0 = Math.min(dragStart.current.y, cy);
    setRegion({
      x: Math.max(0, Math.round(x0)),
      y: Math.max(0, Math.round(y0)),
      w: Math.round(Math.abs(cx - dragStart.current.x)),
      h: Math.round(Math.abs(cy - dragStart.current.y)),
    });
  };
  const onSourcePointerUp = () => {
    dragStart.current = null;
  };

  const downloadPng = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${imageName}-outline.png`;
    a.click();
  };

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setImageUrl(null);
    setResultUrl(null);
    setRegion(null);
    setImageName("outline");
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">🎨 PNG 흰색 테두리 생성기</h1>
          <Link href="/tools" className="btn btn-ghost btn-xs">
            ← 도구 목록
          </Link>
        </div>
        <p className="mt-1 text-sm text-base-content/70">
          투명 PNG에 흰색(또는 원하는 색) 테두리를 한 번에. 카카오 이모티콘 심사
          가독성 보강에 자주 쓰여요.
        </p>
      </div>

      {!imageUrl ? (
        <label
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-base-300 bg-base-100 p-6 text-center transition hover:border-primary hover:bg-primary/5"
        >
          <span className="text-4xl">📥</span>
          <p className="mt-2 text-sm font-medium">PNG 선택 또는 여기에 드래그</p>
          <p className="text-xs text-base-content/60">
            투명 배경 PNG가 가장 잘 동작해요
          </p>
          <input
            type="file"
            accept="image/png,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
        </label>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase text-base-content/60">
                    원본
                  </h3>
                  <div
                    ref={previewRef}
                    onPointerDown={onSourcePointerDown}
                    onPointerMove={onSourcePointerMove}
                    onPointerUp={onSourcePointerUp}
                    onPointerLeave={onSourcePointerUp}
                    className="relative aspect-square w-full overflow-hidden rounded-xl"
                    style={{ ...BG_STYLE[bg], touchAction: "none" }}
                  >
                    <img
                      ref={imgRef}
                      src={imageUrl}
                      alt="원본"
                      onLoad={onImgLoad}
                      className="absolute inset-0 h-full w-full object-contain"
                      draggable={false}
                    />
                    {!trackAll && region && imgRef.current && (
                      <div
                        className="pointer-events-none absolute border-2 border-primary"
                        style={{
                          left: `${(region.x / imgRef.current.naturalWidth) * 100}%`,
                          top: `${(region.y / imgRef.current.naturalHeight) * 100}%`,
                          width: `${(region.w / imgRef.current.naturalWidth) * 100}%`,
                          height: `${(region.h / imgRef.current.naturalHeight) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                  {!trackAll && (
                    <button
                      onClick={() => setRegion(null)}
                      className="btn btn-ghost btn-xs mt-1 w-full"
                    >
                      선택 초기화
                    </button>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase text-base-content/60">
                    결과 {busy && "(처리 중...)"}
                  </h3>
                  <div
                    className="relative aspect-square w-full overflow-hidden rounded-xl"
                    style={BG_STYLE[bg]}
                  >
                    {resultUrl && (
                      <img
                        src={resultUrl}
                        alt="결과"
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="card border border-base-300 bg-base-100">
            <div className="card-body space-y-3 p-3">
              <div>
                <label className="label py-1 text-xs font-bold">테두리 굵기</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={40}
                    value={thickness}
                    onChange={(e) => setThickness(Number(e.target.value))}
                    className="range range-primary range-xs"
                  />
                  <span className="w-10 text-right text-xs">{thickness}px</span>
                </div>
              </div>
              <div>
                <label className="label py-1 text-xs font-bold">테두리 색</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-base-300"
                  />
                  <code className="text-xs text-base-content/70">{color}</code>
                </div>
              </div>
              <div>
                <label className="label cursor-pointer justify-start gap-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={trackAll}
                    onChange={(e) => setTrackAll(e.target.checked)}
                    className="checkbox checkbox-xs checkbox-primary"
                  />
                  <span className="font-bold">전체 불투명 영역에 테두리</span>
                </label>
                <p className="pl-6 text-[10px] text-base-content/60">
                  체크 해제하면 드래그로 사각형 영역을 직접 지정할 수 있어요.
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
              <button
                onClick={downloadPng}
                disabled={!resultUrl || busy}
                className="btn btn-primary btn-sm"
              >
                📥 PNG 다운로드
              </button>
              <button onClick={reset} className="btn btn-ghost btn-sm">
                🔄 다른 이미지로 교체
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="alert text-xs">
        ℹ️ 모든 처리는 브라우저에서만 일어나요. 이미지를 서버에 올리지 않습니다.
        2-pass 거리 변환을 사용해 큰 이미지도 즉시 처리해요.
      </div>
    </div>
  );
}
