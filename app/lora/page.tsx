"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { LoraStatus } from "@/components/LoraStatus";
import {
  buildSeedZipBlob,
  fetchLoraStatus,
  generateWithLora,
  loadLoraRecords,
  pollLoraStatus,
  saveLoraRecord,
  startLoraTraining,
  uploadSeedZip,
  type LoraStatusSnapshot,
  type StoredLoraRecord,
} from "@/lib/ai/lora";
import {
  loadLorasFromFirestore,
  saveLoraToFirestore,
  syncLoras,
} from "@/lib/firebase/loraStore";
import {
  clearReplicateByok,
  getReplicateByok,
  isValidReplicateKey,
  maskReplicateKey,
  setReplicateByok,
} from "@/lib/byok-replicate";

type SeedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type Phase =
  | "idle"
  | "uploading"
  | "training"
  | "succeeded"
  | "failed"
  | "preview-generating"
  | "preview-ready"
  | "preview-failed";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "대기",
  uploading: "ZIP 업로드 중",
  training: "Replicate 학습 중",
  succeeded: "학습 성공",
  failed: "학습 실패",
  "preview-generating": "테스트 생성 중",
  "preview-ready": "테스트 생성 완료",
  "preview-failed": "테스트 생성 실패",
};

const MAX_SEEDS = 8;

function newSeedId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function LoraPage() {
  const { user } = useAuth();

  // BYOK state
  const [byokKey, setByokKey] = useState("");
  const [byokConsent, setByokConsent] = useState(false);
  const [byokSavedKey, setByokSavedKey] = useState("");
  const [byokSavedConsent, setByokSavedConsent] = useState(false);
  const [byokFeedback, setByokFeedback] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(false);

  // Seeds & training inputs
  const [seeds, setSeeds] = useState<SeedImage[]>([]);
  const [triggerWord, setTriggerWord] = useState("VBMOJI");
  const [steps, setSteps] = useState(1000);

  // Training flow
  const [phase, setPhase] = useState<Phase>("idle");
  const [trainingId, setTrainingId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<LoraStatusSnapshot | null>(null);
  const [resultRecord, setResultRecord] = useState<StoredLoraRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preview generation
  const [previewPrompt, setPreviewPrompt] = useState(
    "a cute chibi sticker of {trigger} waving hello, transparent background, kakao emoticon style",
  );
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // Saved records list
  const [records, setRecords] = useState<StoredLoraRecord[]>([]);
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load BYOK + saved records on mount, then try to sync with Firestore
  useEffect(() => {
    const s = getReplicateByok();
    setByokKey(s.key);
    setByokSavedKey(s.key);
    setByokConsent(s.consented);
    setByokSavedConsent(s.consented);

    const local = loadLoraRecords(user?.uid ?? null);
    setRecords(local);
    setSyncedIds(new Set());

    const uid = user?.uid;
    if (!uid) return;

    let cancelled = false;
    (async () => {
      try {
        const merged = await syncLoras(uid, local);
        if (cancelled) return;
        setRecords(merged);
        // 동기화 직후, 원격에 존재하는 ID 집합을 다시 조회해 배지 표시 기준으로 사용
        try {
          const remote = await loadLorasFromFirestore(uid);
          if (cancelled) return;
          setSyncedIds(new Set(remote.map((r) => r.trainingId)));
        } catch {
          // 배지용 정보 — 실패해도 흐름에는 영향 없음
        }
      } catch {
        // Firestore 실패는 로컬 흐름을 막지 않음
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Cleanup preview URLs on unmount/replace
  useEffect(() => {
    return () => {
      seeds.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tokenActive = byokSavedConsent && isValidReplicateKey(byokSavedKey);

  const onSaveByok = () => {
    if (byokKey && !isValidReplicateKey(byokKey)) {
      setByokFeedback("형식이 올바르지 않아요. r8_ 로 시작하는 토큰을 입력해주세요.");
      return;
    }
    if (byokKey && !byokConsent) {
      setByokFeedback("토큰을 사용하려면 약관 동의에 체크해주세요.");
      return;
    }
    setReplicateByok(byokKey, byokConsent);
    setByokSavedKey(byokKey);
    setByokSavedConsent(byokConsent);
    setByokFeedback(byokKey ? "✅ 토큰이 저장되었어요." : "토큰을 비웠어요.");
  };

  const onClearByok = () => {
    clearReplicateByok();
    setByokKey("");
    setByokConsent(false);
    setByokSavedKey("");
    setByokSavedConsent(false);
    setByokFeedback("토큰을 삭제했어요.");
  };

  const handleAddFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setSeeds((prev) => {
      const remaining = MAX_SEEDS - prev.length;
      const next = list.slice(0, remaining).map<SeedImage>((file) => ({
        id: newSeedId(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...next];
    });
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleAddFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleAddFiles(e.dataTransfer.files);
  };

  const onRemoveSeed = (id: string) => {
    setSeeds((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  };

  const isBusy = useMemo(
    () =>
      phase === "uploading" ||
      phase === "training" ||
      phase === "preview-generating",
    [phase],
  );

  const onStartTraining = async () => {
    setErrorMessage(null);
    setSnapshot(null);
    setResultRecord(null);
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (!tokenActive) {
      setErrorMessage("Replicate 토큰을 먼저 등록해주세요.");
      return;
    }
    if (seeds.length < 1) {
      setErrorMessage("시드 이미지를 1장 이상 업로드해주세요.");
      return;
    }
    const trimTrigger = triggerWord.trim() || "VBMOJI";

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setPhase("uploading");
      const zip = await buildSeedZipBlob(seeds.map((s) => s.file));
      const zipUrl = await uploadSeedZip(user?.uid ?? null, zip);

      setPhase("training");
      setStartedAt(Date.now());
      const start = await startLoraTraining({
        inputImagesUrl: zipUrl,
        triggerWord: trimTrigger,
        steps,
      });
      setTrainingId(start.trainingId);

      // 빠른 첫 상태 호출 — UI 반응성 향상
      try {
        const first = await fetchLoraStatus(start.trainingId);
        setSnapshot(first);
      } catch {
        // 첫 호출 실패는 폴링이 처리
      }

      const finalSnap = await pollLoraStatus(start.trainingId, {
        intervalMs: 5000,
        onProgress: (snap) => setSnapshot(snap),
        signal: ac.signal,
      });
      setSnapshot(finalSnap);

      if (!finalSnap.weights) {
        throw new Error("학습은 성공했지만 weights URL이 비어있어요.");
      }

      const record: StoredLoraRecord = {
        trainingId: start.trainingId,
        destination: start.destination,
        weights: finalSnap.weights,
        triggerWord: trimTrigger,
        createdAt: Date.now(),
      };
      saveLoraRecord(user?.uid ?? null, record);
      setRecords(loadLoraRecords(user?.uid ?? null));
      setResultRecord(record);
      setPhase("succeeded");

      // Firestore 동기화 — 실패해도 흐름 안 막게 catch
      const uid = user?.uid;
      if (uid) {
        try {
          await saveLoraToFirestore(uid, record);
          setSyncedIds((prev) => {
            const next = new Set(prev);
            next.add(record.trainingId);
            return next;
          });
        } catch {
          // Firestore 실패는 조용히 무시 (로컬에는 이미 저장됨)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setErrorMessage(msg);
      setPhase("failed");
    }
  };

  const onCancel = () => {
    abortRef.current?.abort();
  };

  const onGeneratePreview = async () => {
    if (!resultRecord) return;
    setErrorMessage(null);
    setPhase("preview-generating");
    try {
      const prompt = previewPrompt.replaceAll("{trigger}", resultRecord.triggerWord);
      const blob = await generateWithLora(resultRecord.weights, prompt, {
        loraScale: 0.8,
      });
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setPhase("preview-ready");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setErrorMessage(msg);
      setPhase("preview-failed");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">🎨 LoRA 학습 — 캐릭터 일관성 강화</h1>
        <p className="text-sm text-base-content/70">
          시드 이미지 1~8장으로 Flux LoRA를 자동 학습해 32장 모두 같은 캐릭터로 유지합니다.
          학습은 약 3-5분 (steps {steps} 기준), 비용은 약 $0.5 — 사용자의 Replicate 토큰으로 결제됩니다.
        </p>
      </header>

      {/* BYOK */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <h2 className="card-title text-lg">1. Replicate 토큰</h2>
          {tokenActive ? (
            <div className="alert alert-success text-xs">
              <span>
                ✅ 토큰 등록 완료: <code>{maskReplicateKey(byokSavedKey)}</code>
              </span>
            </div>
          ) : (
            <div className="alert alert-warning text-xs">
              <span>
                토큰이 없거나 약관 동의가 안 됐어요. 발급:{" "}
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-primary"
                >
                  replicate.com/account/api-tokens
                </a>
              </span>
            </div>
          )}

          <label className="form-control">
            <span className="label-text text-xs font-bold">Replicate API Token (r8_...)</span>
            <div className="join">
              <input
                type={revealKey ? "text" : "password"}
                value={byokKey}
                onChange={(e) => setByokKey(e.target.value)}
                placeholder="r8_..."
                className="input input-bordered join-item w-full font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setRevealKey((v) => !v)}
                className="btn join-item"
                title="키 표시/숨김"
              >
                {revealKey ? "🙈" : "👁"}
              </button>
            </div>
          </label>

          <label className="label cursor-pointer items-start justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-primary checkbox-sm mt-0.5"
              checked={byokConsent}
              onChange={(e) => setByokConsent(e.target.checked)}
            />
            <span className="label-text text-xs">
              <strong>BYOK 약관 동의</strong> · 토큰은 브라우저 localStorage에만 보관되며,
              학습/생성 호출 시에만 서버 라우트로 전달됩니다. 서버는 토큰을 저장/로깅하지 않습니다.
              학습 비용(~$0.5)과 생성 비용(~$0.025/장)은 Replicate 계정에서 직접 청구됩니다.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button onClick={onSaveByok} className="btn btn-primary btn-sm">
              💾 저장
            </button>
            {byokSavedKey && (
              <button onClick={onClearByok} className="btn btn-ghost btn-sm">
                🗑 삭제
              </button>
            )}
          </div>

          {byokFeedback && (
            <div className="alert text-xs">
              <span>{byokFeedback}</span>
            </div>
          )}
        </div>
      </section>

      {/* 시드 업로드 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <h2 className="card-title text-lg">2. 시드 이미지 업로드</h2>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="rounded border-2 border-dashed border-base-300 bg-base-200/50 p-6 text-center"
          >
            <p className="text-sm text-base-content/70">
              이미지 파일을 끌어다 놓거나, 아래 버튼으로 선택해주세요. (최대 {MAX_SEEDS}장)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-sm btn-outline mt-3"
              disabled={isBusy || seeds.length >= MAX_SEEDS}
            >
              📁 파일 선택
            </button>
            <p className="mt-2 text-[11px] text-base-content/50">
              현재 {seeds.length}/{MAX_SEEDS}장. 1장만 있어도 학습 가능하지만 3-5장 권장.
            </p>
          </div>

          {seeds.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {seeds.map((seed) => (
                <div key={seed.id} className="relative aspect-square overflow-hidden rounded border border-base-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={seed.previewUrl}
                    alt="시드 이미지"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveSeed(seed.id)}
                    disabled={isBusy}
                    className="absolute right-1 top-1 rounded-full bg-base-100/80 px-1.5 text-xs hover:bg-error hover:text-error-content"
                    aria-label="제거"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 학습 옵션 */}
      <section className="card border border-base-300 bg-base-100">
        <div className="card-body space-y-3">
          <h2 className="card-title text-lg">3. 학습 옵션</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-control">
              <span className="label-text text-xs font-bold">트리거 단어</span>
              <input
                type="text"
                value={triggerWord}
                onChange={(e) => setTriggerWord(e.target.value)}
                className="input input-bordered input-sm font-mono"
                placeholder="VBMOJI"
                disabled={isBusy}
              />
              <span className="label-text-alt text-[11px] text-base-content/60">
                생성 프롬프트에 이 단어를 포함시키면 학습된 캐릭터가 호출돼요.
              </span>
            </label>

            <label className="form-control">
              <span className="label-text text-xs font-bold">학습 steps ({steps})</span>
              <input
                type="range"
                min={500}
                max={2000}
                step={100}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="range range-primary range-sm"
                disabled={isBusy}
              />
              <span className="label-text-alt text-[11px] text-base-content/60">
                기본 1000 권장. 늘리면 정밀도 ↑ 시간/비용 ↑
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onStartTraining}
              disabled={!tokenActive || seeds.length === 0 || isBusy}
              className="btn btn-primary btn-sm"
            >
              🚀 학습 시작 (3-5분)
            </button>
            {isBusy && (
              <button onClick={onCancel} className="btn btn-ghost btn-sm">
                취소
              </button>
            )}
            <span className="ml-auto self-center text-xs text-base-content/60">
              현재 단계: <strong>{PHASE_LABEL[phase]}</strong>
            </span>
          </div>

          {errorMessage && (
            <div className="alert alert-error text-xs">
              <span>{errorMessage}</span>
            </div>
          )}

          {phase === "training" && (
            <div className="alert text-xs">
              <span>
                ⏳ 학습이 진행 중입니다. 페이지를 닫지 마세요. 진행률은 약 30초~1분 단위로 업데이트됩니다.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 진행률 */}
      {(trainingId || snapshot) && (
        <section>
          <LoraStatus snapshot={snapshot} startedAt={startedAt} trainingId={trainingId} />
        </section>
      )}

      {/* 결과 + 미리보기 */}
      {resultRecord && (
        <section className="card border border-success/40 bg-base-100">
          <div className="card-body space-y-3">
            <h2 className="card-title text-lg">4. 학습 완료 — 테스트 생성</h2>
            <div className="text-xs text-base-content/70">
              destination: <code className="font-mono">{resultRecord.destination}</code>
              <br />
              weights:{" "}
              <code className="break-all font-mono text-[11px]">
                {resultRecord.weights}
              </code>
            </div>

            <label className="form-control">
              <span className="label-text text-xs font-bold">테스트 프롬프트</span>
              <textarea
                value={previewPrompt}
                onChange={(e) => setPreviewPrompt(e.target.value)}
                className="textarea textarea-bordered textarea-sm font-mono"
                rows={3}
              />
              <span className="label-text-alt text-[11px] text-base-content/60">
                {"{trigger}"}는 트리거 단어({resultRecord.triggerWord})로 자동 치환됩니다.
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={onGeneratePreview}
                disabled={phase === "preview-generating"}
                className="btn btn-secondary btn-sm"
              >
                🎨 1장 테스트 생성 (~$0.025)
              </button>
              <Link
                href={`/generate?lora=latest&trigger=${encodeURIComponent(resultRecord.triggerWord)}`}
                className="btn btn-primary btn-sm"
              >
                ✨ 이 LoRA로 32장 만들기 →
              </Link>
              <Link href="/generate" className="btn btn-ghost btn-sm">
                일반 생성 페이지로
              </Link>
            </div>

            {previewBlobUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewBlobUrl}
                  alt="LoRA 테스트 결과"
                  className="rounded border border-base-300"
                  style={{ maxWidth: 360 }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* 저장된 LoRA 목록 */}
      {records.length > 0 && (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body space-y-2">
            <h2 className="card-title text-lg">저장된 LoRA</h2>
            <ul className="space-y-1 text-xs">
              {records.map((r) => {
                const isSynced = syncedIds.has(r.trainingId);
                return (
                  <li
                    key={r.trainingId}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="badge badge-sm badge-outline font-mono">
                      {r.triggerWord}
                    </span>
                    {user?.uid ? (
                      isSynced ? (
                        <span className="badge badge-sm badge-success badge-outline">
                          Firestore 동기화됨
                        </span>
                      ) : (
                        <span className="badge badge-sm badge-ghost">로컬만</span>
                      )
                    ) : (
                      <span className="badge badge-sm badge-ghost">로컬만</span>
                    )}
                    <code className="break-all">{r.destination}</code>
                    <span className="ml-auto text-base-content/60">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-base-content/50">
              {user?.uid
                ? "로그인된 계정의 Firestore에 자동 동기화됩니다 — 다른 기기에서도 같은 목록이 보여요."
                : "현재 로그인되지 않아 localStorage에만 저장됩니다. 로그인하면 디바이스 간 동기화돼요."}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
