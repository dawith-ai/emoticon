"use client";

/**
 * 32 슬롯 일괄 진행률 그리드.
 *
 * - 입력은 BatchResult[] — batch-animate.ts의 결과 스냅샷 그대로 받는다.
 * - 슬롯별 상태 뱃지(대기/진행 중/변환 중/완료/실패) + 미니 미리보기를 표시.
 * - 메모리 누수 방지를 위해 GIF/MP4 objectURL은 컴포넌트 내부에서 생성·회수한다.
 */

import { useEffect, useMemo, useState } from "react";
import type { BatchResult, BatchSlotStatus } from "@/lib/ai/batch-animate";

export interface BatchAnimateGridProps {
  results: ReadonlyArray<BatchResult>;
  /** 미리보기 우선순위. 'gif' (기본) 또는 'mp4' */
  preview?: "gif" | "mp4";
}

interface SlotPreview {
  url: string | null;
  kind: "gif" | "mp4" | null;
}

function statusBadge(status: BatchSlotStatus): { label: string; cls: string } {
  switch (status) {
    case "pending":
      return { label: "대기", cls: "badge-ghost" };
    case "starting":
      return { label: "시작 중", cls: "badge-info" };
    case "processing":
      return { label: "I2V 진행", cls: "badge-info" };
    case "converting":
      return { label: "GIF 변환", cls: "badge-warning" };
    case "succeeded":
      return { label: "완료", cls: "badge-success" };
    case "failed":
      return { label: "실패", cls: "badge-error" };
    case "canceled":
      return { label: "취소", cls: "badge-neutral" };
    default:
      return { label: status, cls: "badge-ghost" };
  }
}

function buildPreview(
  result: BatchResult,
  preview: "gif" | "mp4",
): { gif: Blob | null; mp4: Blob | null; kind: "gif" | "mp4" | null } {
  if (preview === "gif") {
    if (result.gif) return { gif: result.gif, mp4: null, kind: "gif" };
    if (result.mp4) return { gif: null, mp4: result.mp4, kind: "mp4" };
  } else {
    if (result.mp4) return { gif: null, mp4: result.mp4, kind: "mp4" };
    if (result.gif) return { gif: result.gif, mp4: null, kind: "gif" };
  }
  return { gif: null, mp4: null, kind: null };
}

export function BatchAnimateGrid({
  results,
  preview = "gif",
}: BatchAnimateGridProps) {
  // 슬롯별 objectURL 캐시. 같은 Blob이면 같은 URL 재사용.
  const [previews, setPreviews] = useState<Record<number, SlotPreview>>({});

  // results 변경 시 새 Blob에 대해 URL을 만들고, 사라진 슬롯의 URL은 회수.
  useEffect(() => {
    const next: Record<number, SlotPreview> = {};
    const created: string[] = [];

    for (const r of results) {
      const target = buildPreview(r, preview);
      const prev = previews[r.slot];

      // 같은 Blob을 가리키는 경우엔 prev의 URL을 그대로 둔다.
      const sameAsPrev =
        prev?.kind === "gif"
          ? prev.url !== null && target.kind === "gif" && target.gif !== null
          : prev?.kind === "mp4"
            ? prev.url !== null && target.kind === "mp4" && target.mp4 !== null
            : false;

      if (sameAsPrev && prev) {
        next[r.slot] = prev;
        continue;
      }

      // 새로 만들 대상 결정
      if (target.kind === "gif" && target.gif) {
        const url = URL.createObjectURL(target.gif);
        created.push(url);
        next[r.slot] = { url, kind: "gif" };
      } else if (target.kind === "mp4" && target.mp4) {
        const url = URL.createObjectURL(target.mp4);
        created.push(url);
        next[r.slot] = { url, kind: "mp4" };
      } else {
        next[r.slot] = { url: null, kind: null };
      }

      // 이전에 만들어둔 URL이 있고 더는 일치하지 않으면 회수
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
    }

    // 결과 목록에서 사라진 슬롯의 prev URL 회수
    for (const slotKey of Object.keys(previews)) {
      const slot = Number(slotKey);
      if (next[slot] === undefined && previews[slot]?.url) {
        URL.revokeObjectURL(previews[slot].url);
      }
    }

    setPreviews(next);

    return () => {
      // 컴포넌트 언마운트 시 새로 만든 URL 회수.
      for (const url of created) URL.revokeObjectURL(url);
    };
    // results / preview 변경 시에만 재구성. previews는 setter 내부에서만 다룸.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, preview]);

  const stats = useMemo(() => {
    let succeeded = 0;
    let failed = 0;
    let inflight = 0;
    for (const r of results) {
      if (r.status === "succeeded") succeeded++;
      else if (r.status === "failed" || r.status === "canceled") failed++;
      else if (r.status !== "pending") inflight++;
    }
    return { succeeded, failed, inflight, total: results.length };
  }, [results]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/70">
        <span className="badge badge-success badge-sm">완료 {stats.succeeded}</span>
        {stats.inflight > 0 && (
          <span className="badge badge-info badge-sm">진행 중 {stats.inflight}</span>
        )}
        {stats.failed > 0 && (
          <span className="badge badge-error badge-sm">실패/취소 {stats.failed}</span>
        )}
        <span className="opacity-60">/ 전체 {stats.total}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
        {results.map((r) => {
          const badge = statusBadge(r.status);
          const slotPreview = previews[r.slot];
          const url = slotPreview?.url ?? null;
          const kind = slotPreview?.kind ?? null;
          const progressPct =
            r.status === "converting"
              ? r.gifProgress !== null
                ? Math.round(r.gifProgress * 100)
                : null
              : r.progress !== null
                ? Math.round(r.progress * 100)
                : null;

          return (
            <div
              key={r.slot}
              className={`relative flex aspect-square flex-col overflow-hidden rounded-lg border bg-base-100 ${
                r.status === "failed" || r.status === "canceled"
                  ? "border-error/60"
                  : r.status === "succeeded"
                    ? "border-success/40"
                    : "border-base-300"
              }`}
              title={
                r.error
                  ? `${r.slot}. ${r.label} — ${r.error}`
                  : `${r.slot}. ${r.label} — ${badge.label}`
              }
            >
              {/* 미리보기 */}
              <div className="relative flex flex-1 items-center justify-center bg-base-200">
                {url && kind === "gif" ? (
                  <img
                    src={url}
                    alt={`${r.label} GIF`}
                    className="h-full w-full object-contain"
                  />
                ) : url && kind === "mp4" ? (
                  <video
                    src={url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : r.status === "processing" ||
                  r.status === "starting" ||
                  r.status === "converting" ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : r.status === "failed" || r.status === "canceled" ? (
                  <span className="text-[10px] text-error">×</span>
                ) : (
                  <span className="text-[10px] opacity-40">—</span>
                )}
              </div>

              {/* 라벨 + 상태 뱃지 */}
              <div className="flex items-center justify-between gap-1 border-t border-base-300 px-1 py-0.5">
                <span className="truncate text-[9px] text-base-content/70">
                  {r.slot}.{r.label}
                </span>
                <span className={`badge badge-xs ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              {/* 진행률 바 */}
              {progressPct !== null &&
                r.status !== "succeeded" &&
                r.status !== "failed" &&
                r.status !== "canceled" && (
                  <div className="h-1 bg-base-300">
                    <div
                      className="h-1 bg-primary transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
