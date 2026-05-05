"use client";

import { useRef, useState, useEffect } from "react";
import { EMOTION_SLOTS_32 } from "@/lib/platforms";

const TOOLS = [
  { id: "brush", emoji: "🖌️", label: "브러시" },
  { id: "eraser", emoji: "🧽", label: "지우개" },
  { id: "fill", emoji: "🪣", label: "채우기" },
  { id: "text", emoji: "🅰️", label: "텍스트" },
];

const COLORS = [
  "#000000",
  "#FF5C8A",
  "#9C7BFF",
  "#FFD166",
  "#34D399",
  "#7DD3FC",
  "#F87171",
  "#FFFFFF",
];

export default function EditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState("#FF5C8A");
  const [brushSize, setBrushSize] = useState(8);
  const [activeSlot, setActiveSlot] = useState(0);
  const [filledSlots, setFilledSlots] = useState<Set<number>>(new Set());
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [activeSlot]);

  const start = (x: number, y: number) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (x: number, y: number) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,0)" : color;
    ctx.globalCompositeOperation =
      tool === "eraser" ? "destination-out" : "source-over";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    drawing.current = false;
    setFilledSlots((prev) => new Set(prev).add(activeSlot));
  };

  const getCoords = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setFilledSlots((prev) => {
      const n = new Set(prev);
      n.delete(activeSlot);
      return n;
    });
  };

  const aiSuggest = () => {
    alert(
      "AI 보정/추천 (목업)\n\n" +
        "이 슬롯에 어울리는 표정을 분석 중...\n" +
        "→ '" +
        EMOTION_SLOTS_32[activeSlot] +
        "' 컨셉의 추천 표정 3종이 생성됩니다.\n\n" +
        "(실제 동작은 Nano Banana 연동 후)"
    );
  };

  const totalProgress = filledSlots.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">✏️ 수동 에디터</h1>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary badge-outline">
            {totalProgress} / 32
          </span>
          <button onClick={aiSuggest} className="btn btn-secondary btn-sm">
            🤖 AI 보정
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-base-content/60">슬롯 #{activeSlot + 1}</span>
                <h2 className="text-lg font-bold">
                  {EMOTION_SLOTS_32[activeSlot]}
                </h2>
              </div>
              <span className="badge badge-ghost">360 × 360</span>
            </div>

            <div className="mt-3 flex justify-center">
              <div className="rounded-2xl bg-base-200 p-2">
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={360}
                  className="touch-none rounded-xl bg-white shadow-inner"
                  style={{ width: 320, height: 320 }}
                  onPointerDown={(e) => {
                    const { x, y } = getCoords(e);
                    start(x, y);
                  }}
                  onPointerMove={(e) => {
                    const { x, y } = getCoords(e);
                    move(x, y);
                  }}
                  onPointerUp={end}
                  onPointerLeave={end}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  className={`btn btn-sm ${
                    tool === t.id ? "btn-primary" : "btn-ghost"
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
              <button onClick={clear} className="btn btn-ghost btn-sm ml-auto">
                🗑️ 지우기
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-base-content/60">색상</span>
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
              <span className="ml-4 text-xs text-base-content/60">두께</span>
              <input
                type="range"
                min={2}
                max={32}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="range range-primary range-xs w-32"
              />
              <span className="text-xs">{brushSize}px</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <label className="cursor-pointer label gap-1">
                <input type="checkbox" defaultChecked className="checkbox checkbox-primary checkbox-xs" />
                <span>외곽선 자동 (4px)</span>
              </label>
              <label className="cursor-pointer label gap-1">
                <input type="checkbox" defaultChecked className="checkbox checkbox-primary checkbox-xs" />
                <span>투명 배경 자동</span>
              </label>
            </div>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body p-4">
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
            <button className="btn btn-primary btn-sm mt-3">
              세트 저장하기
            </button>
            <button className="btn btn-ghost btn-sm">📤 ZIP 패키징</button>
          </div>
        </div>
      </div>

      <div className="alert alert-info text-xs">
        ℹ️ 목업 빌드입니다. 실제 저장/패키징은 Firebase Storage 연동 후 동작해요.
      </div>
    </div>
  );
}
