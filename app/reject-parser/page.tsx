"use client";

/**
 * 카카오 거절 메일 파서 — standalone 테스트 페이지.
 *
 * 사용자가 받은 거절 메일 본문을 붙여넣고 "Gemini로 분석" 또는 "오프라인(키워드만)으로 분석"을 눌러
 * 6 차원 confidence, primary/secondary, summary, actionableLines 결과를 즉시 확인.
 *
 * BYOK Gemini 키 설정 시: Gemini 모드 활성.
 * 키 없을 때: 오프라인 모드만 활성 (안내 표시).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DIMENSIONS,
  DIMENSION_LABEL_KO,
  type Dimension,
} from "@/lib/ai/kakao-critic";
import {
  classifyOffline,
  parseRejectEmail,
  RejectParserError,
  type RejectClassification,
} from "@/lib/ai/reject-parser";
import { getActiveByokKey } from "@/lib/byok";

const PLACEHOLDER = `예시:
안녕하세요. 제안해주신 이모티콘은 아쉽게도 이번에 출시가 어렵게 되었어요.
캐릭터 일관성이 부족하고, 외곽선 두께가 들쭉날쭉해 보입니다.
표정에서 어떤 감정인지 명확하지 않은 부분도 있어 의도 전달이 어렵습니다.
보완 후 다시 제안 부탁드립니다.`;

type Mode = "idle" | "running" | "succeeded" | "failed";

type SentimentBadge = {
  label: string;
  className: string;
};

const SENTIMENT_BADGE: Record<RejectClassification["rawSentiment"], SentimentBadge> = {
  harsh: { label: "강한 어조", className: "badge-error" },
  neutral: { label: "중립 어조", className: "badge-ghost" },
  encouraging: { label: "격려 어조", className: "badge-success" },
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function dimensionBarColor(value: number): string {
  if (value >= 0.7) return "bg-error";
  if (value >= 0.4) return "bg-warning";
  if (value > 0) return "bg-info";
  return "bg-base-300";
}

interface DimensionBarProps {
  dim: Dimension;
  value: number;
  isPrimary: boolean;
  isSecondary: boolean;
}

function DimensionBar({ dim, value, isPrimary, isSecondary }: DimensionBarProps) {
  const widthPct = Math.max(2, Math.round(value * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-sm font-medium">
        {DIMENSION_LABEL_KO[dim]}
      </div>
      <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-base-200">
        <div
          className={`h-full ${dimensionBarColor(value)} transition-all`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="w-16 shrink-0 text-right text-sm tabular-nums">
        {pct(value)}
      </div>
      <div className="flex w-24 shrink-0 gap-1">
        {isPrimary && <span className="badge badge-error badge-sm">primary</span>}
        {isSecondary && <span className="badge badge-warning badge-sm">secondary</span>}
      </div>
    </div>
  );
}

interface ResultPanelProps {
  result: RejectClassification;
}

function ResultPanel({ result }: ResultPanelProps) {
  const primary = result.primary;
  const secondarySet = new Set(result.secondary);
  const sentiment = SENTIMENT_BADGE[result.rawSentiment];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-base-300 bg-base-100 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-base-content/70">요약</span>
          <span className={`badge ${sentiment.className} badge-sm`}>
            {sentiment.label}
          </span>
          {primary ? (
            <span className="badge badge-error badge-sm">
              primary: {DIMENSION_LABEL_KO[primary]}
            </span>
          ) : (
            <span className="badge badge-ghost badge-sm">primary: 없음</span>
          )}
          {result.secondary.map((d) => (
            <span key={d} className="badge badge-warning badge-sm">
              secondary: {DIMENSION_LABEL_KO[d]}
            </span>
          ))}
        </div>
        <p className="text-sm leading-relaxed">{result.summary}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-base-content/70">
          차원별 거절 사유 신뢰도
        </h3>
        <div className="space-y-2 rounded-lg border border-base-300 bg-base-100 p-4">
          {DIMENSIONS.map((dim) => (
            <DimensionBar
              key={dim}
              dim={dim}
              value={result.dimensions[dim]}
              isPrimary={primary === dim}
              isSecondary={secondarySet.has(dim)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-base-content/70">
          행동 가능 문장 ({result.actionableLines.length})
        </h3>
        {result.actionableLines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-base-300 bg-base-100 p-4 text-sm text-base-content/60">
            추출된 구체적 행동 가능 문장이 없어요.
          </p>
        ) : (
          <ul className="space-y-2 rounded-lg border border-base-300 bg-base-100 p-4">
            {result.actionableLines.map((line, idx) => (
              <li
                key={`${idx}-${line.slice(0, 16)}`}
                className="text-sm leading-relaxed"
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-content">
                  {idx + 1}
                </span>
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function RejectParserPage() {
  const [text, setText] = useState<string>("");
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RejectClassification | null>(null);
  const [usedMode, setUsedMode] = useState<"gemini" | "offline" | null>(null);

  useEffect(() => {
    setHasKey(Boolean(getActiveByokKey()));
  }, []);

  const trimmedLength = useMemo(() => text.trim().length, [text]);
  const canRun = trimmedLength > 0 && mode !== "running";

  const runOffline = () => {
    setMode("running");
    setError(null);
    try {
      const out = classifyOffline(text);
      setResult(out);
      setUsedMode("offline");
      setMode("succeeded");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setError(message);
      setMode("failed");
    }
  };

  const runGemini = async () => {
    setMode("running");
    setError(null);
    try {
      const out = await parseRejectEmail(text);
      setResult(out);
      setUsedMode("gemini");
      setMode("succeeded");
    } catch (err: unknown) {
      if (err instanceof RejectParserError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("알 수 없는 오류");
      }
      setMode("failed");
    }
  };

  const onClear = () => {
    setText("");
    setResult(null);
    setError(null);
    setMode("idle");
    setUsedMode(null);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-base-content/60">
          <Link href="/" className="link link-hover">
            홈
          </Link>
          <span>·</span>
          <span>거절 메일 파서</span>
        </div>
        <h1 className="text-2xl font-bold">카카오 거절 메일 파서</h1>
        <p className="text-sm text-base-content/70">
          거절 메일 본문을 붙여넣으면 6 차원
          (선/색/배경/표정/일관성/저작권)으로 자동 분류해요. Gemini 모드는 더
          정확하지만 BYOK 키가 필요하고, 오프라인 모드는 키워드 매칭으로 즉시
          결과를 보여줘요.
        </p>
        {!hasKey && (
          <div className="alert alert-info text-sm">
            <span>
              BYOK Gemini 키가 설정되지 않아 오프라인(키워드) 모드만 사용할 수
              있어요.{" "}
              <Link href="/settings" className="link">
                설정에서 키 등록
              </Link>
              을 마치면 Gemini 분석이 활성화돼요.
            </span>
          </div>
        )}
      </header>

      <section className="space-y-3">
        <label className="text-sm font-semibold text-base-content/70">
          거절 메일 본문
        </label>
        <textarea
          className="textarea textarea-bordered min-h-48 w-full font-mono text-sm"
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={mode === "running"}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={runGemini}
            disabled={!canRun || !hasKey}
            title={hasKey ? undefined : "BYOK Gemini 키가 필요해요"}
          >
            {mode === "running" && usedMode === "gemini"
              ? "분석 중…"
              : "Gemini로 분석"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={runOffline}
            disabled={!canRun}
          >
            {mode === "running" && usedMode === "offline"
              ? "분석 중…"
              : "오프라인(키워드만)으로 분석"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClear}
            disabled={mode === "running"}
          >
            초기화
          </button>
          <span className="ml-auto text-xs text-base-content/60">
            {trimmedLength} 자
          </span>
        </div>
      </section>

      {error && (
        <div className="alert alert-error text-sm">
          <span>분석 실패: {error}</span>
        </div>
      )}

      {result && mode === "succeeded" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">분석 결과</h2>
            <span className="badge badge-outline">
              {usedMode === "gemini" ? "Gemini 모드" : "오프라인 모드"}
            </span>
          </div>
          <ResultPanel result={result} />
        </section>
      )}
    </div>
  );
}
