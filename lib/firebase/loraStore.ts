/**
 * LoRA 학습 결과를 Firestore에 영속화하는 모듈 (no React).
 *
 * 경로: users/{uid}/loras/{trainingId}
 *
 * 사용 흐름:
 *   - 학습 성공 시 saveLoraToFirestore(uid, record) 호출 → 디바이스 간 동기화
 *   - 페이지 마운트 시 syncLoras(uid, localRecords) 호출 → local + remote 병합
 *
 * Firebase 미초기화(getClientDb() === null) 시 모든 함수는 안전하게 no-op.
 * 호출자는 try/catch로 감싸 Firestore 실패가 핵심 흐름을 막지 않게 처리해야 함.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/client";
import type { StoredLoraRecord } from "@/lib/ai/lora";

export type LoraDoc = StoredLoraRecord & { syncedAt: number };

const LORA_LIMIT = 20;

function lorasCollectionPath(uid: string): string {
  return `users/${uid}/loras`;
}

function isValidUid(uid: string): boolean {
  return Boolean(uid) && /^[A-Za-z0-9_-]+$/.test(uid);
}

function parseLoraDoc(raw: unknown): StoredLoraRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.trainingId !== "string" ||
    typeof r.destination !== "string" ||
    typeof r.weights !== "string" ||
    typeof r.triggerWord !== "string" ||
    typeof r.createdAt !== "number"
  ) {
    return null;
  }
  return {
    trainingId: r.trainingId,
    destination: r.destination,
    weights: r.weights,
    triggerWord: r.triggerWord,
    createdAt: r.createdAt,
  };
}

/**
 * 학습 결과를 users/{uid}/loras/{trainingId} 문서로 upsert.
 * Firestore 미초기화 또는 잘못된 uid면 no-op.
 */
export async function saveLoraToFirestore(
  uid: string,
  record: StoredLoraRecord,
): Promise<void> {
  const db = getClientDb();
  if (!db || !isValidUid(uid)) return;
  const ref = doc(db, lorasCollectionPath(uid), record.trainingId);
  const payload: LoraDoc = {
    trainingId: record.trainingId,
    destination: record.destination,
    weights: record.weights,
    triggerWord: record.triggerWord,
    createdAt: record.createdAt,
    syncedAt: Date.now(),
  };
  await setDoc(ref, payload, { merge: true });
}

/**
 * 사용자의 LoRA 기록을 Firestore에서 createdAt desc 최신 20개 로드.
 * Firestore 미초기화 또는 잘못된 uid면 빈 배열 반환.
 */
export async function loadLorasFromFirestore(
  uid: string,
): Promise<StoredLoraRecord[]> {
  const db = getClientDb();
  if (!db || !isValidUid(uid)) return [];
  const colRef = collection(db, lorasCollectionPath(uid));
  const q = query(colRef, orderBy("createdAt", "desc"), limit(LORA_LIMIT));
  const snap = await getDocs(q);
  const records: StoredLoraRecord[] = [];
  snap.forEach((d) => {
    const parsed = parseLoraDoc(d.data());
    if (parsed) records.push(parsed);
  });
  return records;
}

/**
 * users/{uid}/loras/{trainingId} 문서 삭제.
 * Firestore 미초기화 또는 잘못된 uid면 no-op.
 */
export async function deleteLoraFromFirestore(
  uid: string,
  trainingId: string,
): Promise<void> {
  const db = getClientDb();
  if (!db || !isValidUid(uid) || !trainingId) return;
  const ref = doc(db, lorasCollectionPath(uid), trainingId);
  await deleteDoc(ref);
}

/**
 * 로컬과 Firestore의 LoRA 기록을 양방향 병합.
 *
 * - 로컬에만 있는 record는 Firestore로 push (saveLoraToFirestore).
 * - Firestore에만 있는 record는 결과에 포함.
 * - trainingId 기준 dedup, createdAt desc 정렬.
 *
 * Firestore 미초기화 시 로컬 그대로 반환 (no-op).
 */
export async function syncLoras(
  uid: string,
  localRecords: ReadonlyArray<StoredLoraRecord>,
): Promise<StoredLoraRecord[]> {
  const db = getClientDb();
  if (!db || !isValidUid(uid)) {
    return [...localRecords].sort((a, b) => b.createdAt - a.createdAt);
  }

  const remote = await loadLorasFromFirestore(uid);
  const remoteIds = new Set(remote.map((r) => r.trainingId));

  // 로컬에만 있는 항목을 원격으로 push
  const toPush = localRecords.filter((r) => !remoteIds.has(r.trainingId));
  await Promise.all(toPush.map((r) => saveLoraToFirestore(uid, r)));

  // 병합 + dedup (trainingId 기준, 둘 다 있으면 createdAt 최신 우선)
  const merged = new Map<string, StoredLoraRecord>();
  for (const r of remote) merged.set(r.trainingId, r);
  for (const r of localRecords) {
    const existing = merged.get(r.trainingId);
    if (!existing || r.createdAt > existing.createdAt) {
      merged.set(r.trainingId, r);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}
