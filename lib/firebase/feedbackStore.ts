/**
 * 카카오 제출 결과 옵트인 수집 모듈 (no React).
 *
 * 경로: users/{uid}/submissions/{id}
 *
 * 목적:
 *  - 사용자가 카카오에 제출한 결과(합격/거절/심사중/취하)를 옵트인으로 모음
 *  - 거절 사유 + 차원 분류를 통해 코치가 시간이 갈수록 강해지는 플라이휠 데이터
 *  - 우리 사전 감사 점수 vs 실제 결과 캘리브레이션 측정
 *
 * Firebase 미초기화(getClientDb() === null) 또는 잘못된 uid 시 모든 함수는 안전하게
 * no-op 또는 빈 배열 반환. 호출자는 try/catch로 감싸 흐름이 막히지 않게 처리해야 함.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/client";

export type SubmissionOutcome =
  | "approved"
  | "rejected"
  | "pending"
  | "withdrawn";

export type RejectDimension =
  | "line"
  | "color"
  | "background"
  | "expression"
  | "consistency"
  | "copyright"
  | "other";

export const REJECT_DIMENSIONS: ReadonlyArray<RejectDimension> = [
  "line",
  "color",
  "background",
  "expression",
  "consistency",
  "copyright",
  "other",
];

export const REJECT_DIMENSION_LABEL_KO: Record<RejectDimension, string> = {
  line: "선/외곽",
  color: "색상",
  background: "배경",
  expression: "표정/감정",
  consistency: "일관성",
  copyright: "저작권",
  other: "기타",
};

export const SUBMISSION_OUTCOME_LABEL_KO: Record<SubmissionOutcome, string> = {
  approved: "합격",
  rejected: "거절",
  pending: "심사중",
  withdrawn: "취하",
};

export type SubmissionRecord = {
  id: string;
  userId: string;
  title: string;
  submittedAt: number;
  resultAt?: number;
  outcome: SubmissionOutcome;
  rejectReason?: string;
  rejectDimensions?: RejectDimension[];
  auditOverall?: number;
  auditApprovalProb?: number;
  notes?: string;
  createdAt: number;
};

const SUBMISSION_LIMIT = 200;

function submissionsCollectionPath(uid: string): string {
  return `users/${uid}/submissions`;
}

function isValidUid(uid: string): boolean {
  return Boolean(uid) && /^[A-Za-z0-9_-]+$/.test(uid);
}

function isOutcome(value: unknown): value is SubmissionOutcome {
  return (
    value === "approved" ||
    value === "rejected" ||
    value === "pending" ||
    value === "withdrawn"
  );
}

function isRejectDimension(value: unknown): value is RejectDimension {
  return (
    typeof value === "string" &&
    (REJECT_DIMENSIONS as ReadonlyArray<string>).includes(value)
  );
}

function parseRejectDimensions(raw: unknown): RejectDimension[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RejectDimension[] = [];
  for (const item of raw) {
    if (isRejectDimension(item) && !out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : undefined;
}

function parseSubmissionDoc(raw: unknown): SubmissionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.userId !== "string" ||
    typeof r.title !== "string" ||
    typeof r.submittedAt !== "number" ||
    !isOutcome(r.outcome) ||
    typeof r.createdAt !== "number"
  ) {
    return null;
  }
  const record: SubmissionRecord = {
    id: r.id,
    userId: r.userId,
    title: r.title,
    submittedAt: r.submittedAt,
    outcome: r.outcome,
    createdAt: r.createdAt,
  };
  if (typeof r.resultAt === "number") record.resultAt = r.resultAt;
  if (typeof r.rejectReason === "string" && r.rejectReason.length > 0) {
    record.rejectReason = r.rejectReason;
  }
  const dims = parseRejectDimensions(r.rejectDimensions);
  if (dims) record.rejectDimensions = dims;
  if (typeof r.auditOverall === "number") record.auditOverall = r.auditOverall;
  if (typeof r.auditApprovalProb === "number") {
    record.auditApprovalProb = r.auditApprovalProb;
  }
  if (typeof r.notes === "string" && r.notes.length > 0) record.notes = r.notes;
  return record;
}

function generateLocalId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

/**
 * undefined 필드를 제거한 평탄화된 페이로드를 만든다.
 * Firestore는 undefined 값을 거부하므로, optional 필드는 값이 있을 때만 포함.
 */
function buildPayload(record: SubmissionRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: record.id,
    userId: record.userId,
    title: record.title,
    submittedAt: record.submittedAt,
    outcome: record.outcome,
    createdAt: record.createdAt,
  };
  if (typeof record.resultAt === "number") payload.resultAt = record.resultAt;
  if (record.rejectReason) payload.rejectReason = record.rejectReason;
  if (record.rejectDimensions && record.rejectDimensions.length > 0) {
    payload.rejectDimensions = record.rejectDimensions;
  }
  if (typeof record.auditOverall === "number") {
    payload.auditOverall = record.auditOverall;
  }
  if (typeof record.auditApprovalProb === "number") {
    payload.auditApprovalProb = record.auditApprovalProb;
  }
  if (record.notes) payload.notes = record.notes;
  return payload;
}

/**
 * 제출 결과를 users/{uid}/submissions/{id} 문서로 upsert.
 * id 미지정 시 자동 생성, 생성/지정된 id를 반환.
 * Firestore 미초기화 또는 잘못된 uid면 즉시 빈 문자열 반환 (no-op).
 */
export async function saveSubmission(
  uid: string,
  record: Omit<SubmissionRecord, "id" | "createdAt"> & { id?: string },
): Promise<string> {
  if (!isValidUid(uid)) return "";
  const db = getClientDb();
  if (!db) return "";
  const id = record.id && record.id.length > 0 ? record.id : generateLocalId();
  const full: SubmissionRecord = {
    id,
    userId: uid,
    title: record.title,
    submittedAt: record.submittedAt,
    outcome: record.outcome,
    createdAt: Date.now(),
  };
  if (typeof record.resultAt === "number") full.resultAt = record.resultAt;
  if (record.rejectReason) full.rejectReason = record.rejectReason;
  if (record.rejectDimensions && record.rejectDimensions.length > 0) {
    full.rejectDimensions = record.rejectDimensions;
  }
  if (typeof record.auditOverall === "number") {
    full.auditOverall = record.auditOverall;
  }
  if (typeof record.auditApprovalProb === "number") {
    full.auditApprovalProb = record.auditApprovalProb;
  }
  if (record.notes) full.notes = record.notes;
  try {
    const ref = doc(db, submissionsCollectionPath(uid), id);
    await setDoc(ref, buildPayload(full), { merge: true });
    return id;
  } catch {
    return "";
  }
}

/**
 * 사용자의 제출 기록을 createdAt desc로 로드.
 */
export async function loadSubmissions(
  uid: string,
  opts?: { limit?: number },
): Promise<SubmissionRecord[]> {
  if (!isValidUid(uid)) return [];
  const db = getClientDb();
  if (!db) return [];
  const max = Math.min(
    Math.max(1, opts?.limit ?? SUBMISSION_LIMIT),
    SUBMISSION_LIMIT,
  );
  try {
    const colRef = collection(db, submissionsCollectionPath(uid));
    const q = query(colRef, orderBy("createdAt", "desc"), fsLimit(max));
    const snap = await getDocs(q);
    const records: SubmissionRecord[] = [];
    snap.forEach((d) => {
      const parsed = parseSubmissionDoc(d.data());
      if (parsed) records.push(parsed);
    });
    return records;
  } catch {
    return [];
  }
}

/**
 * 부분 업데이트. patch에 포함된 필드만 갱신.
 */
export async function updateSubmission(
  uid: string,
  id: string,
  patch: Partial<SubmissionRecord>,
): Promise<void> {
  if (!isValidUid(uid) || !id) return;
  const db = getClientDb();
  if (!db) return;
  const update: Record<string, unknown> = {};
  if (typeof patch.title === "string") update.title = patch.title;
  if (typeof patch.submittedAt === "number") {
    update.submittedAt = patch.submittedAt;
  }
  if (typeof patch.resultAt === "number") update.resultAt = patch.resultAt;
  if (patch.outcome && isOutcome(patch.outcome)) update.outcome = patch.outcome;
  if (typeof patch.rejectReason === "string") {
    update.rejectReason = patch.rejectReason;
  }
  if (patch.rejectDimensions !== undefined) {
    const dims = parseRejectDimensions(patch.rejectDimensions);
    if (dims) update.rejectDimensions = dims;
  }
  if (typeof patch.auditOverall === "number") {
    update.auditOverall = patch.auditOverall;
  }
  if (typeof patch.auditApprovalProb === "number") {
    update.auditApprovalProb = patch.auditApprovalProb;
  }
  if (typeof patch.notes === "string") update.notes = patch.notes;
  if (Object.keys(update).length === 0) return;
  try {
    const ref = doc(db, submissionsCollectionPath(uid), id);
    await updateDoc(ref, update);
  } catch {
    // ignore
  }
}

/**
 * 제출 기록 삭제.
 */
export async function deleteSubmission(
  uid: string,
  id: string,
): Promise<void> {
  if (!isValidUid(uid) || !id) return;
  const db = getClientDb();
  if (!db) return;
  try {
    const ref = doc(db, submissionsCollectionPath(uid), id);
    await deleteDoc(ref);
  } catch {
    // ignore
  }
}

export type AggregateStats = {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  approvalRate: number;
  topRejectDimensions: Array<{ dim: RejectDimension; count: number }>;
  predictionCalibration?: {
    meanPredicted: number;
    meanActual: number;
    rmse: number;
  };
};

/**
 * 통계 집계 — pure function. Firestore 없이도 로컬 records로 계산 가능.
 *
 *  - approvalRate: approved / (approved + rejected). 0~1.
 *  - topRejectDimensions: rejected 기록의 rejectDimensions 카운트 desc.
 *  - predictionCalibration: auditApprovalProb이 있는 종결 기록(approved/rejected)에 대해
 *    실제 결과(1 또는 0)와 예측 확률의 평균/RMSE.
 */
export function aggregateStats(
  records: ReadonlyArray<SubmissionRecord>,
): AggregateStats {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  const dimCount = new Map<RejectDimension, number>();
  const predictedList: number[] = [];
  const actualList: number[] = [];

  for (const r of records) {
    if (r.outcome === "approved") approved += 1;
    else if (r.outcome === "rejected") rejected += 1;
    else if (r.outcome === "pending") pending += 1;

    if (r.outcome === "rejected" && r.rejectDimensions) {
      for (const d of r.rejectDimensions) {
        dimCount.set(d, (dimCount.get(d) ?? 0) + 1);
      }
    }

    if (
      typeof r.auditApprovalProb === "number" &&
      (r.outcome === "approved" || r.outcome === "rejected")
    ) {
      predictedList.push(r.auditApprovalProb);
      actualList.push(r.outcome === "approved" ? 1 : 0);
    }
  }

  const decided = approved + rejected;
  const approvalRate = decided > 0 ? approved / decided : 0;

  const topRejectDimensions = Array.from(dimCount.entries())
    .map(([dim, count]) => ({ dim, count }))
    .sort((a, b) => b.count - a.count);

  const stats: AggregateStats = {
    total: records.length,
    approved,
    rejected,
    pending,
    approvalRate,
    topRejectDimensions,
  };

  if (predictedList.length > 0) {
    const n = predictedList.length;
    const meanPredicted =
      predictedList.reduce((a, b) => a + b, 0) / n;
    const meanActual = actualList.reduce((a, b) => a + b, 0) / n;
    let sse = 0;
    for (let i = 0; i < n; i += 1) {
      const diff = predictedList[i] - actualList[i];
      sse += diff * diff;
    }
    const rmse = Math.sqrt(sse / n);
    stats.predictionCalibration = { meanPredicted, meanActual, rmse };
  }

  return stats;
}
