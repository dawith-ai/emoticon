"use client";

/**
 * 카카오 제출 결과 옵트인 수집 페이지 (Feedback).
 *
 * 두 탭:
 *  A. 새 결과 기록 — 제출 정보 + 합격/거절/심사중/취하 결과 + 거절 사유 분류
 *     · sessionStorage 'vibemoji.coach.lastAudit'에서 우리 사전 감사 결과 자동 로드
 *  B. 내 기록 — 통계 카드 + 차원별 거절 빈도 + 우리 감사 캘리브레이션 + 행 수정/삭제
 *
 * Firestore 미초기화 또는 비로그인 시 안전하게 안내. 핵심 흐름이 막히지 않게 try/catch.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  REJECT_DIMENSIONS,
  REJECT_DIMENSION_LABEL_KO,
  SUBMISSION_OUTCOME_LABEL_KO,
  aggregateStats,
  deleteSubmission,
  loadSubmissions,
  saveSubmission,
  updateSubmission,
  type RejectDimension,
  type SubmissionOutcome,
  type SubmissionRecord,
} from "@/lib/firebase/feedbackStore";

type Tab = "record" | "history";

const COACH_AUDIT_SESSION_KEY = "vibemoji.coach.lastAudit";

interface CoachAuditHandoff {
  overall: number;
  approvalProb: number;
  weakestSlots: number[];
  setOverall: number;
}

function isCoachAuditHandoff(value: unknown): value is CoachAuditHandoff {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.overall === "number" &&
    typeof v.approvalProb === "number" &&
    Array.isArray(v.weakestSlots) &&
    v.weakestSlots.every((s) => typeof s === "number") &&
    typeof v.setOverall === "number"
  );
}

function readCoachAuditFromSession(): CoachAuditHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(COACH_AUDIT_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCoachAuditHandoff(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function todayDateInputValue(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString().padStart(4, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToMs(value: string): number {
  if (!value) return Date.now();
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

function msToDateInput(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear().toString().padStart(4, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function outcomeBadgeClass(outcome: SubmissionOutcome): string {
  switch (outcome) {
    case "approved":
      return "badge badge-success";
    case "rejected":
      return "badge badge-error";
    case "pending":
      return "badge badge-warning";
    case "withdrawn":
      return "badge badge-ghost";
    default:
      return "badge";
  }
}

interface RecordTabState {
  title: string;
  submittedAt: string;
  outcome: SubmissionOutcome;
  rejectReason: string;
  rejectDimensions: RejectDimension[];
  notes: string;
  resultAt: string;
  attachAudit: boolean;
}

function makeInitialRecordState(): RecordTabState {
  return {
    title: "",
    submittedAt: todayDateInputValue(),
    outcome: "pending",
    rejectReason: "",
    rejectDimensions: [],
    notes: "",
    resultAt: "",
    attachAudit: true,
  };
}

interface EditDraft {
  id: string;
  title: string;
  submittedAt: string;
  resultAt: string;
  outcome: SubmissionOutcome;
  rejectReason: string;
  rejectDimensions: RejectDimension[];
  notes: string;
}

function recordToDraft(record: SubmissionRecord): EditDraft {
  return {
    id: record.id,
    title: record.title,
    submittedAt: msToDateInput(record.submittedAt),
    resultAt: msToDateInput(record.resultAt),
    outcome: record.outcome,
    rejectReason: record.rejectReason ?? "",
    rejectDimensions: record.rejectDimensions ?? [],
    notes: record.notes ?? "",
  };
}

export default function FeedbackPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const [tab, setTab] = useState<Tab>("record");

  const [coachAudit, setCoachAudit] = useState<CoachAuditHandoff | null>(null);
  const [form, setForm] = useState<RecordTabState>(makeInitialRecordState);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");

  const [records, setRecords] = useState<SubmissionRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [historyError, setHistoryError] = useState<string>("");
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // 코치 사전 감사 결과 자동 로드 (마운트 1회)
  useEffect(() => {
    setCoachAudit(readCoachAuditFromSession());
  }, []);

  const reloadRecords = useMemo(
    () =>
      async (uid: string) => {
        setLoadingRecords(true);
        setHistoryError("");
        try {
          const list = await loadSubmissions(uid, { limit: 200 });
          setRecords(list);
        } catch (err) {
          setHistoryError(
            err instanceof Error ? err.message : "기록을 불러오지 못했어요.",
          );
        } finally {
          setLoadingRecords(false);
        }
      },
    [],
  );

  // 사용자 변경 또는 history 탭 진입 시 로드
  useEffect(() => {
    if (!user) {
      setRecords([]);
      return;
    }
    void reloadRecords(user.uid);
  }, [user, reloadRecords]);

  const stats = useMemo(() => aggregateStats(records), [records]);

  const onToggleDim = (dim: RejectDimension) => {
    setForm((prev) => {
      const has = prev.rejectDimensions.includes(dim);
      return {
        ...prev,
        rejectDimensions: has
          ? prev.rejectDimensions.filter((d) => d !== dim)
          : [...prev.rejectDimensions, dim],
      };
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveMessage("");
    setSaveError("");
    if (!user) {
      setSaveError("Firebase 로그인 후 기록 가능합니다.");
      return;
    }
    if (!form.title.trim()) {
      setSaveError("작품 타이틀을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<SubmissionRecord, "id" | "createdAt"> = {
        userId: user.uid,
        title: form.title.trim(),
        submittedAt: dateInputToMs(form.submittedAt),
        outcome: form.outcome,
      };
      if (form.resultAt) payload.resultAt = dateInputToMs(form.resultAt);
      else if (form.outcome !== "pending") payload.resultAt = Date.now();
      if (form.outcome === "rejected") {
        if (form.rejectReason.trim()) {
          payload.rejectReason = form.rejectReason.trim();
        }
        if (form.rejectDimensions.length > 0) {
          payload.rejectDimensions = form.rejectDimensions;
        }
      }
      if (form.notes.trim()) payload.notes = form.notes.trim();
      if (form.attachAudit && coachAudit) {
        payload.auditOverall = coachAudit.setOverall;
        payload.auditApprovalProb = coachAudit.approvalProb;
      }

      const id = await saveSubmission(user.uid, payload);
      if (!id) {
        setSaveError(
          "저장에 실패했어요. Firestore 설정 또는 권한을 확인해 주세요.",
        );
      } else {
        setSaveMessage("결과가 저장되었어요. 코치가 더 똑똑해질게요!");
        setForm(makeInitialRecordState());
        await reloadRecords(user.uid);
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "저장 중 오류가 발생했어요.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onSaveEdit = async () => {
    if (!user || !editing) return;
    setEditSaving(true);
    try {
      const patch: Partial<SubmissionRecord> = {
        title: editing.title.trim(),
        submittedAt: dateInputToMs(editing.submittedAt),
        outcome: editing.outcome,
      };
      if (editing.resultAt) patch.resultAt = dateInputToMs(editing.resultAt);
      if (editing.outcome === "rejected") {
        patch.rejectReason = editing.rejectReason.trim();
        if (editing.rejectDimensions.length > 0) {
          patch.rejectDimensions = editing.rejectDimensions;
        }
      } else {
        patch.rejectReason = "";
      }
      patch.notes = editing.notes.trim();
      await updateSubmission(user.uid, editing.id, patch);
      setEditing(null);
      await reloadRecords(user.uid);
    } catch {
      // 무시: 사용자에게 행 수정 실패는 조용히 처리, 다음 시도에 재시도
    } finally {
      setEditSaving(false);
    }
  };

  const onDeleteEdit = async () => {
    if (!user || !editing) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm("이 기록을 삭제할까요?");
      if (!ok) return;
    }
    setEditSaving(true);
    try {
      await deleteSubmission(user.uid, editing.id);
      setEditing(null);
      await reloadRecords(user.uid);
    } finally {
      setEditSaving(false);
    }
  };

  const onToggleEditDim = (dim: RejectDimension) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const has = prev.rejectDimensions.includes(dim);
      return {
        ...prev,
        rejectDimensions: has
          ? prev.rejectDimensions.filter((d) => d !== dim)
          : [...prev.rejectDimensions, dim],
      };
    });
  };

  const maxDimCount = stats.topRejectDimensions[0]?.count ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">제출 결과 옵트인 수집</h1>
        <p className="text-sm text-base-content/70">
          카카오에 제출한 결과를 기록하면 코치가 시간이 갈수록 더 똑똑해져요.
          합격/거절 데이터는 사전 감사 정확도 캘리브레이션에 사용됩니다.
        </p>
      </header>

      <div role="tablist" className="tabs tabs-boxed">
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "record" ? "tab-active" : ""}`}
          onClick={() => setTab("record")}
        >
          새 결과 기록
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "history" ? "tab-active" : ""}`}
          onClick={() => setTab("history")}
        >
          내 기록
        </button>
      </div>

      {!configured && (
        <div className="alert alert-warning">
          <span>
            Firebase 클라이언트 환경변수가 설정되지 않아 기록이 비활성화되어
            있어요.
          </span>
        </div>
      )}

      {configured && !authLoading && !user && (
        <div className="alert alert-info">
          <span>
            Firebase 로그인 후 기록 가능 →{" "}
            <Link href="/auth" className="link link-primary">
              /auth 로 이동
            </Link>
          </span>
        </div>
      )}

      {tab === "record" && (
        <section className="card border border-base-300 bg-base-100">
          <form onSubmit={onSubmit} className="card-body space-y-3">
            <h2 className="card-title text-lg">새 결과 기록</h2>

            <label className="form-control">
              <span className="label-text">작품 타이틀</span>
              <input
                className="input input-bordered"
                value={form.title}
                onChange={(e) =>
                  setForm((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="예) 와플냥이 32종 세트"
                required
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="form-control">
                <span className="label-text">제출일</span>
                <input
                  type="date"
                  className="input input-bordered"
                  value={form.submittedAt}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, submittedAt: e.target.value }))
                  }
                />
              </label>
              <label className="form-control">
                <span className="label-text">결과 받은 일 (선택)</span>
                <input
                  type="date"
                  className="input input-bordered"
                  value={form.resultAt}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, resultAt: e.target.value }))
                  }
                />
              </label>
            </div>

            <fieldset className="form-control">
              <legend className="label-text mb-1">결과</legend>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    "approved",
                    "rejected",
                    "pending",
                    "withdrawn",
                  ] as SubmissionOutcome[]
                ).map((o) => (
                  <label
                    key={o}
                    className="label cursor-pointer gap-2 rounded border border-base-300 px-3 py-1"
                  >
                    <input
                      type="radio"
                      name="outcome"
                      className="radio radio-sm"
                      checked={form.outcome === o}
                      onChange={() => setForm((p) => ({ ...p, outcome: o }))}
                    />
                    <span className="label-text">
                      {SUBMISSION_OUTCOME_LABEL_KO[o]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {form.outcome === "rejected" && (
              <>
                <label className="form-control">
                  <span className="label-text">
                    카카오 거절 메일 본문 (옵션)
                  </span>
                  <textarea
                    className="textarea textarea-bordered min-h-24"
                    value={form.rejectReason}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, rejectReason: e.target.value }))
                    }
                    placeholder="받은 거절 메일 본문을 그대로 붙여넣어 주세요."
                  />
                </label>

                <fieldset className="form-control">
                  <legend className="label-text mb-1">거절 차원 (다중)</legend>
                  <div className="flex flex-wrap gap-2">
                    {REJECT_DIMENSIONS.map((dim) => {
                      const active = form.rejectDimensions.includes(dim);
                      return (
                        <button
                          type="button"
                          key={dim}
                          onClick={() => onToggleDim(dim)}
                          className={`btn btn-sm ${active ? "btn-primary" : "btn-outline"}`}
                        >
                          {REJECT_DIMENSION_LABEL_KO[dim]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            )}

            <label className="form-control">
              <span className="label-text">메모 (선택)</span>
              <textarea
                className="textarea textarea-bordered"
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="추가로 남기고 싶은 내용"
              />
            </label>

            <div className="rounded border border-base-300 bg-base-200 p-3">
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={form.attachAudit}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, attachAudit: e.target.checked }))
                  }
                />
                <span className="label-text">
                  이번 작품 사전 감사 결과 함께 기록
                </span>
              </label>
              {coachAudit ? (
                <div className="mt-1 text-xs text-base-content/70">
                  세트 평균 {coachAudit.setOverall.toFixed(1)} / 합격 확률{" "}
                  {formatPct(coachAudit.approvalProb)} / 약점 슬롯{" "}
                  {coachAudit.weakestSlots.join(", ") || "없음"}
                </div>
              ) : (
                <div className="mt-1 text-xs text-base-content/60">
                  세션에 사전 감사 결과가 없어요. /coach 에서 감사를 먼저
                  실행하면 자동 첨부됩니다.
                </div>
              )}
            </div>

            {saveError && (
              <div className="alert alert-error text-sm">{saveError}</div>
            )}
            {saveMessage && (
              <div className="alert alert-success text-sm">{saveMessage}</div>
            )}

            <div className="card-actions justify-end">
              <button
                type="submit"
                disabled={saving || !user}
                className="btn btn-primary"
              >
                {saving && <span className="loading loading-spinner loading-xs" />}
                결과 저장
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === "history" && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard title="총건수" value={stats.total.toString()} />
            <StatCard title="합격" value={stats.approved.toString()} accent="text-success" />
            <StatCard title="거절" value={stats.rejected.toString()} accent="text-error" />
            <StatCard
              title="합격률"
              value={
                stats.approved + stats.rejected > 0
                  ? formatPct(stats.approvalRate)
                  : "—"
              }
              accent="text-primary"
            />
          </div>

          {stats.topRejectDimensions.length > 0 && (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body">
                <h3 className="card-title text-base">차원별 거절 빈도</h3>
                <ul className="space-y-2">
                  {stats.topRejectDimensions.map(({ dim, count }) => {
                    const pct =
                      maxDimCount > 0 ? (count / maxDimCount) * 100 : 0;
                    return (
                      <li key={dim} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{REJECT_DIMENSION_LABEL_KO[dim]}</span>
                          <span className="text-base-content/70">
                            {count}건
                          </span>
                        </div>
                        <progress
                          className="progress progress-error w-full"
                          value={pct}
                          max={100}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {stats.predictionCalibration && (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body">
                <h3 className="card-title text-base">사전 감사 정확도</h3>
                <p className="text-sm text-base-content/70">
                  종결된 기록만으로 계산. RMSE가 낮을수록 우리 합격 확률 예측이
                  실제와 가까워요.
                </p>
                <div className="stats mt-2 bg-base-200">
                  <div className="stat">
                    <div className="stat-title">평균 예측</div>
                    <div className="stat-value text-lg">
                      {formatPct(stats.predictionCalibration.meanPredicted)}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">실제 합격률</div>
                    <div className="stat-value text-lg">
                      {formatPct(stats.predictionCalibration.meanActual)}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">RMSE</div>
                    <div className="stat-value text-lg">
                      {stats.predictionCalibration.rmse.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card border border-base-300 bg-base-100">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <h3 className="card-title text-base">기록 목록</h3>
                {user && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loadingRecords}
                    onClick={() => void reloadRecords(user.uid)}
                  >
                    새로고침
                  </button>
                )}
              </div>
              {historyError && (
                <div className="alert alert-error text-sm">{historyError}</div>
              )}
              {loadingRecords && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="loading loading-spinner loading-xs" />
                  불러오는 중…
                </div>
              )}
              {!loadingRecords && records.length === 0 && (
                <p className="text-sm text-base-content/60">
                  아직 기록이 없어요. 첫 결과를 기록해 주세요.
                </p>
              )}
              {records.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>타이틀</th>
                        <th>제출일</th>
                        <th>결과</th>
                        <th>예측</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr
                          key={r.id}
                          className="hover cursor-pointer"
                          onClick={() => setEditing(recordToDraft(r))}
                        >
                          <td className="font-medium">{r.title}</td>
                          <td>{msToDateInput(r.submittedAt)}</td>
                          <td>
                            <span className={outcomeBadgeClass(r.outcome)}>
                              {SUBMISSION_OUTCOME_LABEL_KO[r.outcome]}
                            </span>
                          </td>
                          <td>
                            {typeof r.auditApprovalProb === "number"
                              ? formatPct(r.auditApprovalProb)
                              : "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(recordToDraft(r));
                              }}
                            >
                              수정
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {editing && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg">
            <h3 className="font-bold">기록 수정</h3>
            <div className="mt-3 space-y-3">
              <label className="form-control">
                <span className="label-text">타이틀</span>
                <input
                  className="input input-bordered"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing((p) =>
                      p ? { ...p, title: e.target.value } : p,
                    )
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="form-control">
                  <span className="label-text">제출일</span>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={editing.submittedAt}
                    onChange={(e) =>
                      setEditing((p) =>
                        p ? { ...p, submittedAt: e.target.value } : p,
                      )
                    }
                  />
                </label>
                <label className="form-control">
                  <span className="label-text">결과 받은 일</span>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={editing.resultAt}
                    onChange={(e) =>
                      setEditing((p) =>
                        p ? { ...p, resultAt: e.target.value } : p,
                      )
                    }
                  />
                </label>
              </div>
              <fieldset className="form-control">
                <legend className="label-text mb-1">결과</legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "approved",
                      "rejected",
                      "pending",
                      "withdrawn",
                    ] as SubmissionOutcome[]
                  ).map((o) => (
                    <label
                      key={o}
                      className="label cursor-pointer gap-2 rounded border border-base-300 px-3 py-1"
                    >
                      <input
                        type="radio"
                        name="edit-outcome"
                        className="radio radio-sm"
                        checked={editing.outcome === o}
                        onChange={() =>
                          setEditing((p) => (p ? { ...p, outcome: o } : p))
                        }
                      />
                      <span className="label-text">
                        {SUBMISSION_OUTCOME_LABEL_KO[o]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {editing.outcome === "rejected" && (
                <>
                  <label className="form-control">
                    <span className="label-text">거절 사유</span>
                    <textarea
                      className="textarea textarea-bordered min-h-20"
                      value={editing.rejectReason}
                      onChange={(e) =>
                        setEditing((p) =>
                          p ? { ...p, rejectReason: e.target.value } : p,
                        )
                      }
                    />
                  </label>
                  <fieldset className="form-control">
                    <legend className="label-text mb-1">차원</legend>
                    <div className="flex flex-wrap gap-2">
                      {REJECT_DIMENSIONS.map((dim) => {
                        const active = editing.rejectDimensions.includes(dim);
                        return (
                          <button
                            type="button"
                            key={dim}
                            onClick={() => onToggleEditDim(dim)}
                            className={`btn btn-xs ${active ? "btn-primary" : "btn-outline"}`}
                          >
                            {REJECT_DIMENSION_LABEL_KO[dim]}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </>
              )}
              <label className="form-control">
                <span className="label-text">메모</span>
                <textarea
                  className="textarea textarea-bordered"
                  value={editing.notes}
                  onChange={(e) =>
                    setEditing((p) =>
                      p ? { ...p, notes: e.target.value } : p,
                    )
                  }
                />
              </label>
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-error btn-outline"
                disabled={editSaving}
                onClick={() => void onDeleteEdit()}
              >
                삭제
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={editSaving}
                onClick={() => setEditing(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={editSaving}
                onClick={() => void onSaveEdit()}
              >
                {editSaving && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                저장
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="close"
            className="modal-backdrop"
            onClick={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  accent?: string;
}

function StatCard({ title, value, accent }: StatCardProps) {
  return (
    <div className="rounded border border-base-300 bg-base-100 p-3">
      <div className="text-xs text-base-content/60">{title}</div>
      <div className={`text-xl font-bold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
