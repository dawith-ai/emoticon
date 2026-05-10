"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getActiveByokKey } from "@/lib/byok";
import {
  judgeBatch,
  JudgeError,
  type JudgeBatchResult,
} from "@/lib/ai/judge";

type FrameItem = {
  id: string;
  slot: number;
  file: File;
  url: string;
};

type RowState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: JudgeBatchResult }
  | { status: "error"; message: string };

export default function JudgePage() {
  const [hasKey, setHasKey] = useState(false);
  const [seedFile, setSeedFile] = useState<File | null>(null);
  const [seedUrl, setSeedUrl] = useState<string>("");
  const [frames, setFrames] = useState<FrameItem[]>([]);
  const [threshold, setThreshold] = useState<number>(7);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHasKey(!!getActiveByokKey());
  }, []);

  // ObjectURL 정리
  useEffect(() => {
    return () => {
      if (seedUrl) URL.revokeObjectURL(seedUrl);
      for (const f of frames) URL.revokeObjectURL(f.url);
    };
    // 마운트 해제 시 한 번만 정리 (state 변화는 setter 안에서 직접 revoke)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSeedChange = (file: File | null) => {
    if (seedUrl) URL.revokeObjectURL(seedUrl);
    if (!file) {
      setSeedFile(null);
      setSeedUrl("");
      return;
    }
    setSeedFile(file);
    setSeedUrl(URL.createObjectURL(file));
  };

  const onFramesChange = (files: FileList | null) => {
    // 기존 url revoke
    for (const f of frames) URL.revokeObjectURL(f.url);
    if (!files || files.length === 0) {
      setFrames([]);
      setRows({});
      return;
    }
    const next: FrameItem[] = Array.from(files).map((file, i) => ({
      id: `${file.name}-${i}-${file.lastModified}`,
      slot: i + 1,
      file,
      url: URL.createObjectURL(file),
    }));
    setFrames(next);
    setRows({});
    setProgress({ done: 0, total: 0 });
  };

  const summary = useMemo(() => {
    const done = Object.values(rows).filter((r) => r.status === "done");
    if (done.length === 0) return null;
    const verdicts = done.flatMap((r) =>
      r.status === "done" ? [r.result.verdict] : [],
    );
    const consistent = verdicts.filter((v) => v.consistent).length;
    const avg =
      verdicts.reduce((s, v) => s + v.score, 0) / verdicts.length || 0;
    return {
      total: verdicts.length,
      consistent,
      flagged: verdicts.length - consistent,
      avg: avg.toFixed(2),
    };
  }, [rows]);

  const start = async () => {
    if (!seedFile || frames.length === 0) {
      setError("시드와 변형 이미지를 모두 업로드해주세요.");
      return;
    }
    setError(null);
    setRunning(true);
    setProgress({ done: 0, total: frames.length });
    setRows(
      Object.fromEntries(
        frames.map((f) => [f.slot, { status: "running" } as RowState]),
      ),
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const results = await judgeBatch(
        seedFile,
        frames.map((f) => ({ slot: f.slot, blob: f.file })),
        {
          threshold,
          concurrency,
          signal: controller.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      );
      setRows(
        Object.fromEntries(
          results.map((r) => [
            r.slot,
            { status: "done", result: r } as RowState,
          ]),
        ),
      );
    } catch (err: unknown) {
      const message =
        err instanceof JudgeError
          ? err.message
          : err instanceof Error
            ? err.message
            : "알 수 없는 오류";
      setError(message);
      setRows((prev) => {
        const copy = { ...prev };
        for (const f of frames) {
          if (copy[f.slot]?.status === "running") {
            copy[f.slot] = { status: "error", message };
          }
        }
        return copy;
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  if (!hasKey) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">🧐 LLM-judge QC</h1>
        <div className="alert alert-warning">
          <div>
            <p className="font-semibold">Gemini 키가 필요해요</p>
            <p className="text-sm mt-1">
              이 도구는 Gemini 2.5 Flash로 시드와 변형 이미지의 캐릭터
              일관성을 판정합니다. BYOK 키를 먼저 등록해주세요.
            </p>
            <Link href="/settings" className="btn btn-sm btn-primary mt-3">
              /settings 에서 키 등록
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">🧐 LLM-judge QC</h1>
      <p className="text-sm opacity-70 mb-6">
        시드 이미지 1장 + 변형 N장을 올리면, Gemini 2.5 Flash가 각 장이 시드와
        같은 캐릭터인지 0–10점으로 판정합니다. 무료 티어 한도(분당 ~10회)에
        맞춰 동시성은 기본 3입니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-base">1. 시드 (reference)</h2>
            <input
              type="file"
              accept="image/*"
              className="file-input file-input-bordered file-input-sm w-full"
              onChange={(e) => onSeedChange(e.target.files?.[0] ?? null)}
              disabled={running}
            />
            {seedUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={seedUrl}
                alt="seed"
                className="mt-3 w-32 h-32 object-cover rounded border"
              />
            )}
          </div>
        </div>

        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-base">2. 변형 (multi-select)</h2>
            <input
              type="file"
              accept="image/*"
              multiple
              className="file-input file-input-bordered file-input-sm w-full"
              onChange={(e) => onFramesChange(e.target.files)}
              disabled={running}
            />
            <p className="text-xs opacity-60 mt-1">
              {frames.length > 0 ? `${frames.length}장 선택됨` : "아직 없음"}
            </p>
          </div>
        </div>
      </div>

      <div className="card bg-base-200 mb-6">
        <div className="card-body">
          <h2 className="card-title text-base">3. 옵션</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="form-control">
              <span className="label-text">임계값 (consistent ≥ N)</span>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                disabled={running}
                className="input input-bordered input-sm"
              />
            </label>
            <label className="form-control">
              <span className="label-text">동시 호출 수 (1–5 권장)</span>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                disabled={running}
                className="input input-bordered input-sm"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {!running ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={start}
            disabled={!seedFile || frames.length === 0}
          >
            판정 시작
          </button>
        ) : (
          <button type="button" className="btn btn-error" onClick={cancel}>
            중단
          </button>
        )}
        {progress.total > 0 && (
          <span className="text-sm opacity-70">
            {progress.done} / {progress.total} 완료
          </span>
        )}
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div className="stats shadow mb-4">
          <div className="stat">
            <div className="stat-title">총</div>
            <div className="stat-value text-lg">{summary.total}</div>
          </div>
          <div className="stat">
            <div className="stat-title">통과</div>
            <div className="stat-value text-lg text-success">
              {summary.consistent}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">불일치</div>
            <div className="stat-value text-lg text-error">
              {summary.flagged}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">평균 점수</div>
            <div className="stat-value text-lg">{summary.avg}</div>
          </div>
        </div>
      )}

      {frames.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>슬롯</th>
                <th>변형</th>
                <th>점수</th>
                <th>일관성</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f) => {
                const row = rows[f.slot] ?? { status: "idle" };
                return (
                  <tr key={f.id}>
                    <td className="font-mono">{f.slot}</td>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={`slot-${f.slot}`}
                        className="w-16 h-16 object-cover rounded border"
                      />
                    </td>
                    <td>
                      {row.status === "done" ? (
                        <span className="font-mono">
                          {row.result.verdict.score}/10
                        </span>
                      ) : row.status === "running" ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : row.status === "error" ? (
                        <span className="text-error text-xs">실패</span>
                      ) : (
                        <span className="opacity-40">-</span>
                      )}
                    </td>
                    <td>
                      {row.status === "done" ? (
                        row.result.verdict.consistent ? (
                          <span className="badge badge-success">통과</span>
                        ) : (
                          <span className="badge badge-error">불일치</span>
                        )
                      ) : (
                        <span className="opacity-40">-</span>
                      )}
                    </td>
                    <td className="text-xs">
                      {row.status === "done"
                        ? row.result.verdict.reason
                        : row.status === "error"
                          ? row.message
                          : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs opacity-60 mt-6">
        ※ Gemini 무료 티어는 분당 ~10회 호출 한도가 있어 32장 처리 시 약 3–4분이
        소요될 수 있습니다. 동시성을 높이면 빠르지만 429 에러 가능성이
        커집니다.
      </p>
    </main>
  );
}
