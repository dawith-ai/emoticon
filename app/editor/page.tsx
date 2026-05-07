"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { getClientDb } from "@/lib/firebase/client";
import { EMOTION_SLOTS_32 } from "@/lib/platforms";
import {
  BRUSH_PRESETS,
  BrushKind,
  applyBrushStyle,
  getPreset,
} from "./_lib/brush-presets";
import { Stabilizer } from "./_lib/stabilizer";
import { CanvasHistory, LayerSnapshot } from "./_lib/canvas-history";
import { DEFAULT_LAYERS, Layer, MAX_LAYERS } from "./_lib/layers";
import { applyOutline } from "@/app/tools/_lib/outline";

const CANVAS_SIZE = 360;
const COLORS = [
  "#000000", "#FFFFFF", "#FF5C8A", "#9C7BFF", "#FFD166",
  "#34D399", "#7DD3FC", "#F87171", "#FBBF24", "#A16207",
  "#EC4899", "#8B5CF6",
];

type Tool = "brush" | "eraser" | "fill" | "ruler" | "text";
type RulerKind = "line" | "rect" | "ellipse";

export default function EditorPage() {
  const { user, configured } = useAuth();
  const layerCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const displayRef = useRef<HTMLCanvasElement>(null);
  const traceImageRef = useRef<HTMLImageElement | null>(null);

  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState("lineart");
  const [tool, setTool] = useState<Tool>("brush");
  const [brushKind, setBrushKind] = useState<BrushKind>("g-pen");
  const [color, setColor] = useState("#000000");
  const [stabilizerLevel, setStabilizerLevel] = useState(3);
  const [activeSlot, setActiveSlot] = useState(0);
  const [filledSlots, setFilledSlots] = useState<Set<number>>(new Set());
  const [rulerKind, setRulerKind] = useState<RulerKind>("line");
  const [traceOpacity, setTraceOpacity] = useState(0.4);
  const [hasTraceImage, setHasTraceImage] = useState(false);
  const [recordingTimelapse, setRecordingTimelapse] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineThickness, setOutlineThickness] = useState(4);
  const [outlineColor, setOutlineColor] = useState("#FFFFFF");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const preset = getPreset(brushKind);
  const [brushSize, setBrushSize] = useState(preset.defaultSize);

  const stabilizer = useRef(new Stabilizer(stabilizerLevel));
  const history = useRef(new CanvasHistory());
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const rulerStart = useRef<{ x: number; y: number } | null>(null);

  // 레이어별 offscreen canvas 초기화
  useEffect(() => {
    for (const layer of DEFAULT_LAYERS) {
      if (!layerCanvases.current.has(layer.id)) {
        const c = document.createElement("canvas");
        c.width = CANVAS_SIZE;
        c.height = CANVAS_SIZE;
        layerCanvases.current.set(layer.id, c);
      }
    }
    composite();
  }, []);

  // 슬롯 변경 시 캔버스 초기화
  useEffect(() => {
    for (const c of layerCanvases.current.values()) {
      const ctx = c.getContext("2d");
      ctx?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
    history.current.clear();
    composite();
  }, [activeSlot]);

  useEffect(() => {
    stabilizer.current.setLevel(stabilizerLevel);
  }, [stabilizerLevel]);

  useEffect(() => {
    setBrushSize(preset.defaultSize);
    setStabilizerLevel(preset.recommendedStabilizer);
  }, [brushKind, preset.defaultSize, preset.recommendedStabilizer]);

  const composite = useCallback(() => {
    const display = displayRef.current;
    if (!display) return;
    const ctx = display.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 트레이스 참고 이미지 (가장 아래)
    if (traceImageRef.current && hasTraceImage) {
      ctx.globalAlpha = traceOpacity;
      ctx.drawImage(traceImageRef.current, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.globalAlpha = 1;
    }

    // 레이어 합성 (배경 → 채색 → 선화 순서)
    for (const layer of [...layers].reverse()) {
      if (!layer.visible) continue;
      const lc = layerCanvases.current.get(layer.id);
      if (!lc) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(lc, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, [layers, hasTraceImage, traceOpacity]);

  useEffect(() => {
    composite();
  }, [composite]);

  const getActiveCtx = (): CanvasRenderingContext2D | null => {
    const c = layerCanvases.current.get(activeLayerId);
    return c?.getContext("2d") ?? null;
  };

  const snapshotFrame = (): LayerSnapshot[] => {
    const out: LayerSnapshot[] = [];
    for (const layer of layers) {
      const c = layerCanvases.current.get(layer.id);
      const ctx = c?.getContext("2d");
      if (ctx) {
        out.push({
          layerId: layer.id,
          imageData: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
        });
      }
    }
    return out;
  };

  const restoreFrame = (frame: LayerSnapshot[]) => {
    for (const snap of frame) {
      const c = layerCanvases.current.get(snap.layerId);
      const ctx = c?.getContext("2d");
      ctx?.putImageData(snap.imageData, 0, 0);
    }
    composite();
  };

  const undo = () => {
    const restored = history.current.undo(snapshotFrame());
    if (restored) restoreFrame(restored);
  };
  const redo = () => {
    const restored = history.current.redo(snapshotFrame());
    if (restored) restoreFrame(restored);
  };

  const getCoords = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = displayRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_SIZE) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_SIZE) / rect.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const layer = layers.find((l) => l.id === activeLayerId);
    if (!layer || layer.locked || !layer.visible) return;
    history.current.commit(snapshotFrame());
    const p = getCoords(e);
    drawing.current = true;
    stabilizer.current.reset();

    if (tool === "ruler") {
      rulerStart.current = p;
      return;
    }
    if (tool === "fill") {
      floodFillBucket(p);
      composite();
      drawing.current = false;
      return;
    }
    if (tool === "text") {
      const text = window.prompt("입력할 텍스트", "");
      if (text) drawText(p, text);
      composite();
      drawing.current = false;
      return;
    }

    const corrected = stabilizer.current.push(p);
    lastPoint.current = corrected;
    drawDot(corrected);
    composite();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = getCoords(e);
    if (tool === "ruler") {
      composite();
      drawRulerPreview(p);
      return;
    }
    const corrected = stabilizer.current.push(p);
    if (lastPoint.current) {
      drawSegment(lastPoint.current, corrected);
    }
    lastPoint.current = corrected;
    composite();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (tool === "ruler" && rulerStart.current) {
      const end = getCoords(e);
      drawRuler(rulerStart.current, end);
      composite();
      rulerStart.current = null;
    }
    drawing.current = false;
    lastPoint.current = null;
    setFilledSlots((prev) => new Set(prev).add(activeSlot));
  };

  const drawDot = (p: { x: number; y: number }) => {
    const ctx = getActiveCtx();
    if (!ctx) return;
    const isErase = tool === "eraser";
    if (isErase) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else {
      applyBrushStyle(ctx, preset, color, brushSize);
      ctx.beginPath();
      ctx.arc(p.x, p.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  const drawSegment = (
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    const ctx = getActiveCtx();
    if (!ctx) return;
    if (tool === "eraser") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    applyBrushStyle(ctx, preset, color, brushSize);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  };

  const drawRulerPreview = (end: { x: number; y: number }) => {
    if (!rulerStart.current) return;
    const display = displayRef.current!;
    const ctx = display.getContext("2d")!;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.setLineDash([4, 4]);
    drawShape(ctx, rulerStart.current, end);
    ctx.restore();
  };

  const drawRuler = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const ctx = getActiveCtx();
    if (!ctx) return;
    ctx.save();
    applyBrushStyle(ctx, preset, color, brushSize);
    drawShape(ctx, start, end);
    ctx.restore();
  };

  const drawShape = (
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => {
    ctx.beginPath();
    if (rulerKind === "line") {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (rulerKind === "rect") {
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.stroke();
    } else {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const floodFillBucket = (p: { x: number; y: number }) => {
    // 단순화: 활성 레이어 전체를 색으로 칠함
    // 실제 flood fill은 픽셀 단위 BFS인데 모바일 성능을 위해 채색 레이어 전체 채우기로 단순화
    const ctx = getActiveCtx();
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-atop"; // 기존 픽셀이 있는 곳만
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.restore();
  };

  const drawText = (p: { x: number; y: number }, text: string) => {
    const ctx = getActiveCtx();
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `bold ${brushSize * 4}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  };

  const clearActiveLayer = () => {
    history.current.commit(snapshotFrame());
    const ctx = getActiveCtx();
    ctx?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    composite();
    setFilledSlots((prev) => {
      const n = new Set(prev);
      n.delete(activeSlot);
      return n;
    });
  };

  const surroundingErase = () => {
    // 카카오 사양에 맞춰 캔버스 외곽 자동 투명화 시뮬레이션
    history.current.commit(snapshotFrame());
    alert(
      "🪄 Surrounding Eraser (목업)\n\n" +
        "캔버스 가장자리에서 안쪽으로 연속된 흰색/배경색을 자동 투명 처리해요.\n\n" +
        "(실제 동작은 sharp + flood-fill 기반 Cloud Function에서 처리)"
    );
  };

  const onTraceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      traceImageRef.current = img;
      setHasTraceImage(true);
      composite();
    };
    img.src = URL.createObjectURL(file);
  };

  const toggleLayerVisible = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };
  const setLayerOpacity = (id: string, opacity: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, opacity } : l))
    );
  };
  const toggleClipMask = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, clipped: !l.clipped } : l))
    );
  };
  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) {
      alert(`최대 ${MAX_LAYERS}개 레이어까지 추가할 수 있어요.`);
      return;
    }
    const id = `layer-${Date.now()}`;
    const c = document.createElement("canvas");
    c.width = CANVAS_SIZE;
    c.height = CANVAS_SIZE;
    layerCanvases.current.set(id, c);
    setLayers((prev) => [
      {
        id,
        name: `레이어 ${prev.length + 1}`,
        visible: true,
        opacity: 1,
        blendMode: "source-over",
        clipped: false,
        locked: false,
      },
      ...prev,
    ]);
    setActiveLayerId(id);
  };

  const aiSuggest = () => {
    alert(
      `🤖 AI 보정/추천 (목업)\n\n` +
        `현재 슬롯: "${EMOTION_SLOTS_32[activeSlot]}"\n` +
        `현재 레이어: "${
          layers.find((l) => l.id === activeLayerId)?.name
        }"\n\n` +
        `→ 같은 캐릭터로 어울리는 표정 3안 자동 생성\n` +
        `→ 카카오 심사 통과율 사전 진단 (외곽선 두께/투명배경/일관성)\n\n` +
        `(실제 동작은 Nano Banana 연동 후)`
    );
  };

  const toggleTimelapse = () => {
    setRecordingTimelapse((prev) => {
      if (!prev) {
        alert(
          "🎬 타임랩스 녹화 시작 (목업)\n\n" +
            "이비스페인트처럼 그리는 과정을 자동 녹화하고, 30초 영상으로 인스타/스레드에 자동 업로드해요.\n\n" +
            "(실제 녹화는 MediaRecorder API + Cloud Function에서 처리)"
        );
      }
      return !prev;
    });
  };

  const saveSet = async () => {
    if (!user) {
      setSaveState("error");
      setSaveMessage("로그인 후 Firestore에 저장할 수 있어요.");
      return;
    }
    const db = getClientDb();
    if (!db) {
      setSaveState("error");
      setSaveMessage("Firebase 클라이언트 설정이 필요해요.");
      return;
    }

    setSaveState("saving");
    setSaveMessage(null);
    try {
      // 1. 프로젝트 메타데이터 저장
      const projectRef = await addDoc(collection(db, "users", user.uid, "projects"), {
        title: `수동 에디터 세트 ${new Date().toLocaleDateString("ko-KR")}`,
        source: "editor",
        status: "draft",
        activeSlot,
        filledSlots: Array.from(filledSlots).sort((a, b) => a - b),
        layerCount: layers.length,
        hasTraceImage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. 채워진 슬롯의 실제 PNG를 Storage에 업로드
      const { uploadStickerPng, canvasToBlob } = await import("@/lib/firebase/storage");
      let uploaded = 0;
      let failed = 0;

      for (const slot of Array.from(filledSlots)) {
        // 슬롯별 합성 이미지 생성: 활성 슬롯이 아닌 경우 현재 표시 캔버스 그대로 저장 못 함
        // 단순화: 현재 활성 슬롯(activeSlot)이 일치할 때만 실제 PNG 업로드
        if (slot !== activeSlot) {
          continue;
        }
        const display = displayRef.current;
        if (!display) {
          failed++;
          continue;
        }
        try {
          const blob = await canvasToBlob(display);
          const result = await uploadStickerPng(
            user.uid,
            projectRef.id,
            slot + 1,
            EMOTION_SLOTS_32[slot],
            blob
          );
          if (result) uploaded++;
          else failed++;
        } catch (err) {
          console.error("Storage upload failed", err);
          failed++;
        }
      }

      setSaveState("saved");
      setSaveMessage(
        uploaded > 0
          ? `프로젝트 ${projectRef.id} 저장 완료 — Storage 업로드 ${uploaded}장${
              failed ? `, 실패 ${failed}장` : ""
            }`
          : `메타데이터만 저장됨 (현재 슬롯 외 PNG는 자동 업로드 안 됨)`
      );
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Firestore 저장에 실패했어요."
      );
    }
  };

  const applyOutlineToActiveLayer = () => {
    const layerCanvas = layerCanvases.current.get(activeLayerId);
    const ctx = layerCanvas?.getContext("2d");
    if (!layerCanvas || !ctx) return;

    // 빈 레이어 가드
    const before = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    let hasPixel = false;
    for (let i = 3; i < before.data.length; i += 4) {
      if (before.data[i] > 0) {
        hasPixel = true;
        break;
      }
    }
    if (!hasPixel) {
      alert("활성 레이어에 그림이 없어요. 먼저 캐릭터를 그린 뒤 [테두리]를 적용해주세요.");
      return;
    }

    history.current.commit(snapshotFrame());

    const hex = outlineColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const result = applyOutline(layerCanvas, {
      thickness: outlineThickness,
      color: { r, g, b, a: 255 },
      alphaThreshold: 16,
    });

    // 결과를 활성 레이어에 다시 그리기
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(result, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    composite();
    setOutlineOpen(false);
    setFilledSlots((prev) => new Set(prev).add(activeSlot));
  };

  const totalProgress = filledSlots.size;
  const activeLayer = layers.find((l) => l.id === activeLayerId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">✏️ 수동 에디터</h1>
        <div className="flex items-center gap-2">
          {recordingTimelapse && (
            <span className="badge badge-error gap-1 animate-pulse">● REC</span>
          )}
          <span className="badge badge-primary badge-outline">
            {totalProgress} / 32
          </span>
          <button onClick={undo} className="btn btn-ghost btn-sm" disabled={!history.current.canUndo()}>
            ↶
          </button>
          <button onClick={redo} className="btn btn-ghost btn-sm" disabled={!history.current.canRedo()}>
            ↷
          </button>
          <button
            onClick={() => setOutlineOpen(true)}
            className="btn btn-accent btn-sm"
            title="활성 레이어에 두꺼운 흰색(또는 컬러) 외곽선 자동 추가"
          >
            🖼️ 테두리
          </button>
          <button onClick={aiSuggest} className="btn btn-secondary btn-sm">
            🤖 AI 보정
          </button>
        </div>
      </div>

      {outlineOpen && (
        <div className="modal modal-open" onClick={() => setOutlineOpen(false)}>
          <div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">🖼️ 테두리 적용</h3>
            <p className="text-xs text-base-content/60">
              활성 레이어 ({activeLayer?.name})의 알파 외곽을 두께만큼 팽창시켜 단색 테두리를 합성해요.
              카카오 이모티콘은 외부폭 4px 흰 테두리가 표준이에요.
            </p>

            <label className="mt-4 block text-sm">
              두께 <span className="font-bold">{outlineThickness}px</span>
              <input
                type="range"
                min={1}
                max={20}
                value={outlineThickness}
                onChange={(e) => setOutlineThickness(Number(e.target.value))}
                className="range range-primary range-sm w-full"
              />
              <div className="flex justify-between text-[10px] text-base-content/50">
                <span>1</span>
                <span>4 (카카오 권장)</span>
                <span>20</span>
              </div>
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm">색</span>
              {["#FFFFFF", "#000000", "#FF5C8A", "#FFD166", "#9C7BFF"].map((c) => (
                <button
                  key={c}
                  onClick={() => setOutlineColor(c)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    outlineColor === c ? "border-primary" : "border-base-300"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={outlineColor}
                onChange={(e) => setOutlineColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border-2 border-base-300"
              />
            </div>

            <div className="modal-action">
              <button onClick={() => setOutlineOpen(false)} className="btn btn-ghost">
                취소
              </button>
              <button onClick={applyOutlineToActiveLayer} className="btn btn-primary">
                적용
              </button>
            </div>
          </div>
        </div>
      )}

      {!user && (
        <div className="alert alert-warning text-sm">
          <span>
            로그인하면 에디터 세트 메타데이터를 Firestore에 저장할 수 있어요.
            {!configured && " 현재 Firebase 환경변수는 아직 설정되지 않았어요."}
          </span>
          {configured && (
            <Link href="/auth" className="btn btn-primary btn-sm">
              로그인
            </Link>
          )}
        </div>
      )}
      {user && saveState !== "idle" && (
        <div
          className={`alert text-xs ${
            saveState === "error" ? "alert-error" : "alert-success"
          }`}
        >
          {saveState === "saving"
            ? "Firestore 저장 중..."
            : saveState === "saved"
            ? "Firestore에 에디터 초안을 저장했어요."
            : saveMessage}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[80px_1fr_280px]">
        {/* 좌측 도구 팔레트 */}
        <aside className="card border border-base-300 bg-base-100 p-2">
          <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
            <ToolButton id="brush" current={tool} onClick={setTool} emoji="🖌️" label="브러시" />
            <ToolButton id="eraser" current={tool} onClick={setTool} emoji="🧽" label="지우개" />
            <ToolButton id="fill" current={tool} onClick={setTool} emoji="🪣" label="채우기" />
            <ToolButton id="ruler" current={tool} onClick={setTool} emoji="📐" label="자" />
            <ToolButton id="text" current={tool} onClick={setTool} emoji="🅰️" label="텍스트" />
          </div>
          <div className="divider my-1"></div>
          <button onClick={surroundingErase} className="btn btn-ghost btn-xs" title="가장자리 자동 투명화">
            🪄
          </button>
          <button
            onClick={toggleTimelapse}
            className={`btn btn-xs mt-1 ${
              recordingTimelapse ? "btn-error" : "btn-ghost"
            }`}
            title="타임랩스 녹화"
          >
            🎬
          </button>
        </aside>

        {/* 중앙 캔버스 */}
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body p-3">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-base-content/60">슬롯 #{activeSlot + 1}</span>
                <span className="ml-2 text-lg font-bold">
                  {EMOTION_SLOTS_32[activeSlot]}
                </span>
              </div>
              <span className="badge badge-ghost">360 × 360</span>
            </div>

            <div className="mt-2 flex justify-center">
              <div
                className="relative rounded-2xl bg-base-200 p-2"
                style={{ touchAction: "none" }}
              >
                <canvas
                  ref={displayRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  className="touch-none rounded-xl bg-white shadow-inner"
                  style={{
                    width: 320,
                    height: 320,
                    backgroundImage:
                      "linear-gradient(45deg, #e8e8e8 25%, transparent 25%), linear-gradient(-45deg, #e8e8e8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8e8e8 75%), linear-gradient(-45deg, transparent 75%, #e8e8e8 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                  }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
              </div>
            </div>

            {/* 브러시 프리셋 4종 */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-base-content/60">브러시</span>
              {BRUSH_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setBrushKind(p.id)}
                  className={`btn btn-xs ${
                    brushKind === p.id ? "btn-primary" : "btn-ghost"
                  }`}
                  title={p.description}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>

            {/* 자 도구 서브메뉴 */}
            {tool === "ruler" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-base-content/60">자 모양</span>
                {(["line", "rect", "ellipse"] as RulerKind[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRulerKind(r)}
                    className={`btn btn-xs ${
                      rulerKind === r ? "btn-primary" : "btn-ghost"
                    }`}
                  >
                    {r === "line" ? "─ 직선" : r === "rect" ? "▭ 사각" : "○ 타원"}
                  </button>
                ))}
              </div>
            )}

            {/* 색 + 두께 + 손떨림 */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-base-content/60">색</span>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 ${
                    color === c ? "border-primary" : "border-base-300"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-full border-2 border-base-300"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                두께
                <input
                  type="range"
                  min={preset.sizeRange[0]}
                  max={preset.sizeRange[1]}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="range range-primary range-xs w-28"
                />
                <span className="w-8">{brushSize}px</span>
              </label>
              <label className="flex items-center gap-1" title="손떨림 보정 — 0=원본, 5=가장 부드러움">
                ✋
                <input
                  type="range"
                  min={0}
                  max={5}
                  value={stabilizerLevel}
                  onChange={(e) => setStabilizerLevel(Number(e.target.value))}
                  className="range range-secondary range-xs w-24"
                />
                <span className="w-4">{stabilizerLevel}</span>
              </label>
              <button onClick={clearActiveLayer} className="btn btn-ghost btn-xs ml-auto">
                🗑️ 레이어 비우기
              </button>
            </div>

            {/* 트레이스 참고 이미지 */}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="btn btn-ghost btn-xs">
                📷 사진 트레이스
                <input
                  type="file"
                  accept="image/*"
                  onChange={onTraceUpload}
                  className="hidden"
                />
              </label>
              {hasTraceImage && (
                <>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={traceOpacity}
                    onChange={(e) => setTraceOpacity(Number(e.target.value))}
                    className="range range-accent range-xs w-24"
                  />
                  <span>{Math.round(traceOpacity * 100)}%</span>
                  <button
                    onClick={() => setTraceOpacity(0.3)}
                    className="btn btn-ghost btn-xs"
                    title="동동 작가 권장값 — 가이드는 30%가 적당"
                  >
                    30% 권장
                  </button>
                  <button
                    onClick={() => {
                      traceImageRef.current = null;
                      setHasTraceImage(false);
                      composite();
                    }}
                    className="btn btn-ghost btn-xs"
                  >
                    제거
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 우측 레이어 + 슬롯 */}
        <aside className="space-y-3">
          {/* 레이어 패널 */}
          <div className="card border border-base-300 bg-base-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">레이어</h3>
              <button onClick={addLayer} className="btn btn-ghost btn-xs">
                + 추가
              </button>
            </div>
            <div className="space-y-1">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayerId(layer.id)}
                  className={`cursor-pointer rounded-lg border p-2 text-xs ${
                    activeLayerId === layer.id
                      ? "border-primary bg-primary/5"
                      : "border-base-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisible(layer.id);
                      }}
                      className="opacity-70 hover:opacity-100"
                    >
                      {layer.visible ? "👁️" : "🚫"}
                    </button>
                    <span className="flex-1 px-2 font-medium">{layer.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleClipMask(layer.id);
                      }}
                      className={layer.clipped ? "text-primary" : "opacity-50"}
                      title="클리핑 마스크 — 아래 레이어 픽셀이 있는 곳에만 표시"
                    >
                      ✂️
                    </button>
                  </div>
                  {activeLayerId === layer.id && (
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={layer.opacity}
                      onChange={(e) => {
                        e.stopPropagation();
                        setLayerOpacity(layer.id, Number(e.target.value));
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="range range-primary range-xs mt-1 w-full"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 32 슬롯 패널 */}
          <div className="card border border-base-300 bg-base-100 p-3">
            <h3 className="text-sm font-bold">32 슬롯</h3>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {EMOTION_SLOTS_32.map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveSlot(idx)}
                  className={`relative aspect-square rounded-lg border text-[10px] ${
                    activeSlot === idx
                      ? "border-primary bg-primary/10"
                      : filledSlots.has(idx)
                      ? "border-success/40 bg-success/5"
                      : "border-dashed border-base-300"
                  }`}
                >
                  <span className="absolute left-0.5 top-0.5 text-[9px] opacity-50">
                    {idx + 1}
                  </span>
                  <span className="block">{label}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <button
                onClick={saveSet}
                disabled={saveState === "saving"}
                className="btn btn-primary btn-sm"
              >
                {saveState === "saving" ? "저장 중..." : "세트 저장"}
              </button>
              <button className="btn btn-ghost btn-sm">📤 ZIP 패키징</button>
            </div>
          </div>
        </aside>
      </div>

      <div className="alert text-xs">
        ℹ️ 이비스페인트 레퍼런스로 만든 목업이에요. 실제 저장/패키징/타임랩스는 Firebase Storage + Cloud Functions 연동 후 동작.
      </div>
    </div>
  );
}

function ToolButton({
  id,
  current,
  onClick,
  emoji,
  label,
}: {
  id: Tool;
  current: Tool;
  onClick: (id: Tool) => void;
  emoji: string;
  label: string;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`btn btn-sm ${current === id ? "btn-primary" : "btn-ghost"}`}
      title={label}
    >
      <span className="text-base">{emoji}</span>
      <span className="ml-1 hidden text-xs lg:inline">{label}</span>
    </button>
  );
}
