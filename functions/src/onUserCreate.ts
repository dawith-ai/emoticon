import { auth } from "firebase-functions/v1";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "./admin";

/**
 * Auth 사용자 생성 트리거 — Firestore에 사용자 문서 + 초기 50 크레딧 지급.
 *
 * 클라이언트가 직접 Firestore에 users 문서를 만들지 못하도록 보안 룰에서 막고,
 * 생성은 이 Function에서만 처리해서 크레딧 조작을 방지함.
 */
export const onUserCreate = auth.user().onCreate(async (user) => {
  const db = getFirestore();
  const ref = db.collection("users").doc(user.uid);

  const doc = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    credits: 50, // 무료 가입 보너스
    createdAt: new Date(),
    lastActiveAt: new Date(),
  };

  await ref.set(doc, { merge: false });

  // 거래 내역 기록 (audit trail)
  await db.collection("credits").doc("transactions").collection("items").add({
    userId: user.uid,
    amount: 50,
    type: "bonus",
    note: "회원가입 보너스 50 크레딧",
    createdAt: new Date(),
  });

  logger.info(`회원가입 + 50 크레딧 지급: ${user.uid} ${user.email}`);
});
