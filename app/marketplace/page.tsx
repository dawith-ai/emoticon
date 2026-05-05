"use client";

import { useState, useMemo } from "react";
import {
  PLATFORMS,
  Platform,
  PlatformCategory,
  CATEGORY_META,
  ALL_CATEGORIES,
} from "@/lib/platforms";

const SORT_OPTIONS = [
  { id: "easy", label: "쉬운 순" },
  { id: "fast", label: "빠른 순" },
  { id: "category", label: "카테고리 순" },
];

type CatFilter = PlatformCategory | "all";

export default function MarketplacePage() {
  const [sort, setSort] = useState("easy");
  const [catFilter, setCatFilter] = useState<CatFilter>("all");
  const [globalOnly, setGlobalOnly] = useState(false);
  const [selected, setSelected] = useState<Platform | null>(null);

  const filtered = useMemo(() => {
    let list = PLATFORMS;
    if (catFilter !== "all") list = list.filter((p) => p.category === catFilter);
    if (globalOnly) list = list.filter((p) => p.global);
    return [...list].sort((a, b) => {
      if (sort === "easy") {
        const order = { 쉬움: 0, 보통: 1, 어려움: 2 };
        return order[a.difficulty] - order[b.difficulty];
      }
      if (sort === "fast") return a.reviewDays.localeCompare(b.reviewDays);
      if (sort === "category") {
        const order: Record<PlatformCategory, number> = {
          messenger: 0,
          stock: 1,
          pod: 2,
          digital: 3,
        };
        return order[a.category] - order[b.category];
      }
      return 0;
    });
  }, [sort, catFilter, globalOnly]);

  const counts = useMemo(() => {
    const map = { all: PLATFORMS.length } as Record<CatFilter, number>;
    for (const cat of ALL_CATEGORIES) {
      map[cat] = PLATFORMS.filter((p) => p.category === cat).length;
    }
    return map;
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-vm-grad p-6 text-primary-content">
        <h1 className="text-2xl font-bold">💰 수익화 허브</h1>
        <p className="mt-1 text-sm opacity-90">
          {PLATFORMS.length}개 플랫폼 4가지 카테고리. 한 번 만든 캐릭터로 모든 곳에 뿌리세요.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <Stat3 label="메신저 이모티콘" value={counts.messenger} emoji="💬" />
          <Stat3 label="요소·스톡" value={counts.stock} emoji="🎨" />
          <Stat3 label="POD 굿즈" value={counts.pod} emoji="🛍️" />
          <Stat3 label="디지털 크리에이터" value={counts.digital} emoji="💼" />
        </div>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">카테고리</span>
            <CatTab
              id="all"
              current={catFilter}
              onClick={setCatFilter}
              label={`전체 ${counts.all}`}
              emoji="🌐"
            />
            {ALL_CATEGORIES.map((c) => (
              <CatTab
                key={c}
                id={c}
                current={catFilter}
                onClick={setCatFilter}
                label={`${CATEGORY_META[c].label} ${counts[c]}`}
                emoji={CATEGORY_META[c].emoji}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm">정렬</span>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setSort(o.id)}
                className={`btn btn-xs ${
                  sort === o.id ? "btn-primary" : "btn-ghost"
                }`}
              >
                {o.label}
              </button>
            ))}
            <label className="ml-auto cursor-pointer label gap-2">
              <input
                type="checkbox"
                checked={globalOnly}
                onChange={(e) => setGlobalOnly(e.target.checked)}
                className="checkbox checkbox-primary checkbox-xs"
              />
              <span className="text-xs">🌍 글로벌만</span>
            </label>
          </div>

          {catFilter !== "all" && (
            <div className="mt-2 rounded-lg bg-base-200 p-2 text-xs text-base-content/70">
              {CATEGORY_META[catFilter].emoji} {CATEGORY_META[catFilter].description}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((p) => (
          <div key={p.id} className="card border border-base-300 bg-base-100">
            <div className="card-body p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <span className="text-3xl">{p.emoji}</span>
                  <div>
                    <h3 className="card-title text-base">
                      {p.name}
                      {p.global && (
                        <span className="badge badge-info badge-xs gap-1">🌍</span>
                      )}
                      {p.nonExclusive && (
                        <span
                          className="badge badge-ghost badge-xs"
                          title="비독점 — 다른 플랫폼에 동시 등록 가능"
                        >
                          비독점
                        </span>
                      )}
                    </h3>
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

      {filtered.length === 0 && (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body items-center text-center">
            <p>이 조건에 맞는 플랫폼이 없어요.</p>
            <button onClick={() => { setCatFilter("all"); setGlobalOnly(false); }} className="btn btn-primary btn-sm">
              필터 초기화
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="modal modal-open" onClick={() => setSelected(null)}>
          <div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
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
        💡 <span className="font-semibold">전략 팁:</span>{" "}
        진입 쉬운 순 → <strong>크라우드픽 / 마플샵 / Gumroad / Etsy</strong> 먼저 등록해서
        패시브 인컴 셋업 → 카카오·텐바이텐 같은 무거운 심사형 도전.
        같은 캐릭터를 4개 카테고리에 동시 등록하면 매출 다각화 + 미승인 리스크 분산.
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

function Stat3({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  return (
    <div className="rounded-lg bg-white/15 px-3 py-1.5">
      <div className="opacity-80">{emoji} {label}</div>
      <div className="text-base font-bold">{value}개</div>
    </div>
  );
}

function CatTab({
  id,
  current,
  onClick,
  label,
  emoji,
}: {
  id: CatFilter;
  current: CatFilter;
  onClick: (id: CatFilter) => void;
  label: string;
  emoji: string;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`btn btn-sm ${current === id ? "btn-primary" : "btn-ghost"}`}
    >
      <span>{emoji}</span> {label}
    </button>
  );
}

function DifficultyBadge({ level }: { level: Platform["difficulty"] }) {
  const map = {
    쉬움: "badge-success",
    보통: "badge-warning",
    어려움: "badge-error",
  } as const;
  return <span className={`badge ${map[level]} badge-outline badge-sm`}>{level}</span>;
}
