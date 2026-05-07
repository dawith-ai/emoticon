import { auth } from "firebase-functions/v1";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "./admin";

/**
 * Auth 사용자 생성 트리거 — Firestore에 사용자 문서 + 초기 5 크레딧 지급.
 *
 * 무료 크레딧은 시드 1번 체험용(5 크레딧 = 시드 1장).
 * 32종 세트(100 크레딧)는 결제 또는 BYOK(본인 Gemini 키) 필요.
 */
const SIGNUP_BONUS_CREDITS = 5;

export const onUserCreate = auth.user().onCreate(async (user) => {
  const db = getFirestore();
  const ref = db.collection("users").doc(user.uid);

  const doc = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    credits: SIGNUP_BONUS_CREDITS,
    createdAt: new Date(),
    lastActiveAt: new Date(),
  };

  await ref.set(doc, { merge: false });

  await db.collection("credits").doc("transactions").collection("items").add({
    userId: user.uid,
    amount: SIGNUP_BONUS_CREDITS,
    type: "bonus",
    note: `회원가입 보너스 ${SIGNUP_BONUS_CREDITS} 크레딧 (시드 1장 체험)`,
    createdAt: new Date(),
  });

  logger.info(`회원가입 + ${SIGNUP_BONUS_CREDITS} 크레딧: ${user.uid} ${user.email}`);
});
