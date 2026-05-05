"use client";

import { useState } from "react";
import { EMOTION_SLOTS_32 } from "@/lib/platforms";

type Step = "input" | "seed" | "set" | "done";

const SAMPLE_SEEDS = ["🐰", "🐻", "🐱", "🐹"];

export default function GeneratePage() {
  const [step, setStep] = useState<Step>("input");
  const [prompt, setPrompt] = useState("분홍 토끼, 둥글둥글한 스타일, 살짝 시크한 표정");
  const [seedIdx, setSeedIdx] = useState(0);
  const [generated, setGenerated] = useState<number[]>([]);

  const goSeed = () => {
    setStep("seed");
  };

  const goSet = () => {
    setStep("set");
    let i = 0;
    const interval = setInterval(() => {
      i += 4;
      setGenerated(Array.from({ length: Math.min(i, 32) }, (_, k) => k));
      if (i >= 32) {
        clearInterval(interval);
        setTimeout(() => setStep("done"), 600);
      }
    }, 300);
  };

  const reset = () => {
    setStep("input");
    setGenerated([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">✨ AI 캐릭터 생성</h1>
        <Stepper current={step} />
      </div>

      {step === "input" && (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h2 className="card-title">어떤 캐릭터를 만들고 싶나요?</h2>
            <p className="text-sm text-base-content/70">
              자연어로 캐릭터의 종류·성격·스타일을 적어주세요. 예시는 아래에서 골라도 돼요.
            </p>
            <textarea
              className="textarea textarea-bordered mt-2 h-32 w-full"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="분홍 토끼, 둥글둥글한 스타일, 살짝 시크한 표정"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "분홍 토끼, 둥글둥글한 스타일",
                "회색 곰돌이, 잠 많은 표정",
                "주황 고양이, 장난꾸러기",
                "보라 햄스터, 시니컬한 표정",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setPrompt(s)}
                  className="btn btn-ghost btn-xs"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-base-content/60">
                💎 시드 1장 = 5 크레딧 차감
              </div>
              <button onClick={goSeed} className="btn btn-primary">
                시드 만들기 →
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "seed" && (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h2 className="card-title">시드 캐릭터를 골라주세요</h2>
            <p className="text-sm text-base-content/70">
              마음에 드는 시드 1장을 고르면, 이걸 기반으로 32종을 일관되게 생성해요.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {SAMPLE_SEEDS.map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => setSeedIdx(idx)}
                  className={`sticker-tile filled text-7xl ${
                    seedIdx === idx ? "ring-4 ring-primary" : ""
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => setStep("input")} className="btn btn-ghost">
                ← 다시 입력
              </button>
              <div className="flex gap-2">
                <button onClick={goSeed} className="btn btn-outline">
                  🔄 재생성 (5💎)
                </button>
                <button onClick={goSet} className="btn btn-primary">
                  32종 생성하기 (100💎) →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(step === "set" || step === "done") && (
        <div className="space-y-4">
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <h2 className="card-title">
                  {step === "set" ? "생성 중..." : "✅ 생성 완료!"}
                </h2>
                <span className="badge badge-primary">
                  {generated.length} / 32
                </span>
              </div>
              {step === "set" && (
                <progress
                  className="progress progress-primary w-full"
                  value={generated.length}
                  max={32}
                ></progress>
              )}
              <div className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-8">
                {EMOTION_SLOTS_32.map((label, idx) => {
                  const filled = generated.includes(idx);
                  return (
                    <div
                      key={idx}
                      className={`sticker-tile ${filled ? "filled" : ""} relative`}
                    >
                      {filled ? (
                        <span className="text-3xl">{SAMPLE_SEEDS[seedIdx]}</span>
                      ) : (
                        <span className="loading loading-spinner loading-xs opacity-40"></span>
                      )}
                      <span className="absolute bottom-0.5 text-[9px] text-base-content/60">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {step === "done" && (
            <div className="card border border-success/30 bg-success/5">
              <div className="card-body">
                <h3 className="card-title text-success">
                  🎉 32장 세트가 완성됐어요
                </h3>
                <p className="text-sm">
                  이제 카카오·OGQ·라인·Etsy 사양에 맞춰 자동 변환된 ZIP을 다운받을 수 있어요.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <button className="btn btn-primary">
                    💛 카카오 ZIP (360x360) 다운로드
                  </button>
                  <button className="btn btn-outline btn-success">
                    🟢 OGQ ZIP (740x640) 다운로드
                  </button>
                  <button className="btn btn-outline">
                    💚 LINE ZIP (370x320) 다운로드
                  </button>
                  <button className="btn btn-outline">
                    🛍️ Etsy ZIP (1000x1000) 다운로드
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href="/marketplace" className="btn btn-warning btn-sm">
                    👉 수익화 허브에서 신청하기
                  </a>
                  <button onClick={reset} className="btn btn-ghost btn-sm">
                    새로 만들기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="alert alert-info text-xs">
        ℹ️ 목업 빌드입니다. 실제 AI 생성/저장은 Firebase + Nano Banana 연동 후 동작해요.
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "input", label: "입력" },
    { key: "seed", label: "시드" },
    { key: "set", label: "32종" },
    { key: "done", label: "완료" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <ul className="steps steps-horizontal hidden md:flex">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={`step ${i <= currentIdx ? "step-primary" : ""}`}
        >
          {s.label}
        </li>
      ))}
    </ul>
  );
}
