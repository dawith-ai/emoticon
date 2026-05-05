"use client";

import { useState } from "react";
import { PLATFORMS, Platform } from "@/lib/platforms";

const SORT_OPTIONS = [
  { id: "easy", label: "쉬운 순" },
  { id: "fast", label: "빠른 순" },
  { id: "revenue", label: "수익 높은 순" },
];

export default function MarketplacePage() {
  const [sort, setSort] = useState("easy");
  const [selected, setSelected] = useState<Platform | null>(null);

  const sorted = [...PLATFORMS].sort((a, b) => {
    if (sort === "easy") {
      const order = { 쉬움: 0, 보통: 1, 어려움: 2 };
      return order[a.difficulty] - order[b.difficulty];
    }
    if (sort === "fast") {
      return a.reviewDays.localeCompare(b.reviewDays);
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-vm-grad p-6 text-primary-content">
        <h1 className="text-2xl font-bold">💰 수익화 허브</h1>
        <p className="mt-1 text-sm opacity-90">
          한 번 만든 캐릭터를 어디에 팔 수 있는지 한눈에. 신청 단계까지 자동 안내해요.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-base-content/70">정렬</span>
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => setSort(o.id)}
            className={`btn btn-sm ${
              sort === o.id ? "btn-primary" : "btn-ghost"
            }`}
          >
            {o.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-base-content/60">
          전체 {PLATFORMS.length}개 플랫폼
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((p) => (
          <div key={p.id} className="card border border-base-300 bg-base-100">
            <div className="card-body">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{p.emoji}</span>
                  <div>
                    <h3 className="card-title text-lg">{p.name}</h3>
                    <p className="text-xs text-base-content/60">{p.notes}</p>
                  </div>
                </div>
                <DifficultyBadge level={p.difficulty} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Stat label="사이즈" value={p.mainSize} />
                <Stat label="장수" value={p.count} />
                <Stat label="포맷" value={p.format} />
                <Stat label="심사" value={p.reviewDays} />
                <Stat label="수수료" value={p.commission} />
                <Stat label="예상 수익" value={p.expectedRevenue} />
              </div>

              <div className="card-actions mt-3 justify-between">
                <button
                  onClick={() => setSelected(p)}
                  className="btn btn-outline btn-sm"
                >
                  📋 단계 보기
                </button>
                <a
                  href={p.submitUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  지금 신청하기 →
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="modal modal-open"
          onClick={() => setSelected(null)}
        >
          <div
            className="modal-box max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  {selected.emoji} {selected.name}
                </h3>
                <p className="text-sm text-base-content/60">{selected.notes}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="btn btn-ghost btn-sm btn-circle"
              >
                ✕
              </button>
            </div>

            <ul className="steps steps-vertical mt-4">
              {selected.steps.map((s, i) => (
                <li key={i} className="step step-primary text-left">
                  {s}
                </li>
              ))}
            </ul>

            <div className="modal-action">
              <a
                href={selected.submitUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
              >
                {selected.name} 페이지 열기 →
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="alert text-xs">
        💡 <span className="font-semibold">팁:</span>{" "}
        OGQ → 라인 → Etsy → 카카오 순으로 도전하면, 카카오 미승인 기간에도 다른 플랫폼에서 수익이 발생해요.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-base-content/60">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function DifficultyBadge({ level }: { level: Platform["difficulty"] }) {
  const map = {
    쉬움: "badge-success",
    보통: "badge-warning",
    어려움: "badge-error",
  } as const;
  return <span className={`badge ${map[level]} badge-outline`}>{level}</span>;
}
