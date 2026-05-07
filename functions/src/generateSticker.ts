import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { GoogleGenAI } from "@google/genai";
import { getFirestore, getStorage } from "./admin";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const SEED_COST = 5;
const SET_COST = 100;

type GenerateSeedRequest = {
  projectId: string;
  characterDescription: string;
  /** BYOK — 사용자가 본인 Gemini 키를 보내면 그걸로 호출하고 크레딧 차감 안 함 */
  byokApiKey?: string;
};

type GenerateSetRequest = {
  projectId: string;
  emotions: Array<{ slot: number; label: string; action: string }>;
  /** BYOK — 본인 키로 호출 시 크레딧 차감 없음 */
  byokApiKey?: string;
};

/**
 * 사용자 키 형식 가벼운 검증.
 * Google AI Studio 키는 `AIza`로 시작하는 39자 문자열.
 * 부적합한 입력으로 SDK가 무의미한 에러를 띄우는 것을 방지.
 */
function isValidByokKey(key: string | undefined): key is string {
  return typeof key === "string" && /^AIza[A-Za-z0-9_-]{30,}$/.test(key.trim());
}

/**
 * 자연어 → 시드 캐릭터 1장 생성.
 * 5 크레딧 차감 + 결과 PNG를 Storage 저장 + Firestore 메타 업데이트.
 */
export const generateSeedCharacter = onCall(
  { secrets: [GEMINI_API_KEY], region: "asia-northeast3", timeoutSeconds: 60 },
  async (req) => {
    const userId = req.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "로그인이 필요해요");

    const { projectId, characterDescription, byokApiKey } = req.data as GenerateSeedRequest;
    if (!projectId || !characterDescription) {
      throw new HttpsError("invalid-argument", "projectId, characterDescription 필수");
    }

    const useBYOK = isValidByokKey(byokApiKey);
    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);

    // BYOK가 아니면 크레딧 차감
    if (!useBYOK) {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const credits = (userSnap.data()?.credits ?? 0) as number;
        if (credits < SEED_COST) {
          throw new HttpsError(
            "failed-precondition",
            `크레딧 부족 (필요 ${SEED_COST}, 보유 ${credits}). 설정에서 본인 Gemini 키를 등록해 무제한 사용도 가능해요.`
          );
        }
        tx.update(userRef, { credits: credits - SEED_COST });
      });
    }

    // Nano Banana 호출 — BYOK 우선, 없으면 운영자 키
    const ai = new GoogleGenAI({
      apiKey: useBYOK ? byokApiKey!.trim() : GEMINI_API_KEY.value(),
    });
    const prompt = buildSeedPrompt(characterDescription);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const imageBase64 = extractImage(response);
    if (!imageBase64) {
      if (!useBYOK) {
        await userRef.update({ credits: (await userRef.get()).data()?.credits + SEED_COST });
        throw new HttpsError("internal", "이미지 생성 실패. 크레딧 환불됨");
      }
      throw new HttpsError("internal", "이미지 생성 실패 (BYOK)");
    }

    // Storage 저장
    const buffer = Buffer.from(imageBase64, "base64");
    const path = `users/${userId}/projects/${projectId}/seed.png`;
    await getStorage()
      .bucket()
      .file(path)
      .save(buffer, { contentType: "image/png" });

    // Firestore 메타 업데이트
    await db
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId)
      .set(
        {
          characterDescription,
          seedPath: path,
          status: "seed",
          updatedAt: new Date(),
        },
        { merge: true }
      );

    // 크레딧 거래 기록 — BYOK는 0 크레딧으로 audit만 남김
    await db.collection("credits").doc("transactions").collection("items").add({
      userId,
      amount: useBYOK ? 0 : -SEED_COST,
      type: useBYOK ? "byok" : "consume",
      note: useBYOK
        ? `시드 생성 — BYOK (project ${projectId})`
        : `시드 생성 (project ${projectId})`,
      relatedProjectId: projectId,
      createdAt: new Date(),
    });

    logger.info(`시드 생성 완료: ${userId}/${projectId} byok=${useBYOK}`);
    return { ok: true, seedPath: path, byok: useBYOK };
  }
);

/**
 * 시드 + 32 감정 → 32장 변형 일괄 생성.
 *
 * 100 크레딧 차감. 일부 실패는 무시하고 부분 결과 반환.
 * 전체 실패 시 환불.
 */
export const generateStickerSet = onCall(
  { secrets: [GEMINI_API_KEY], region: "asia-northeast3", timeoutSeconds: 540, memory: "1GiB" },
  async (req) => {
    const userId = req.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "로그인 필요");

    const { projectId, emotions, byokApiKey } = req.data as GenerateSetRequest;
    if (!projectId || !emotions || emotions.length === 0) {
      throw new HttpsError("invalid-argument", "projectId, emotions 필수");
    }

    const useBYOK = isValidByokKey(byokApiKey);
    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);
    const projectRef = userRef.collection("projects").doc(projectId);

    // 시드 로드
    const projectSnap = await projectRef.get();
    const seedPath = projectSnap.data()?.seedPath;
    if (!seedPath) throw new HttpsError("failed-precondition", "시드가 없음");

    // BYOK가 아니면 크레딧 차감
    if (!useBYOK) {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const credits = (userSnap.data()?.credits ?? 0) as number;
        if (credits < SET_COST) {
          throw new HttpsError(
            "failed-precondition",
            `크레딧 부족 (필요 ${SET_COST}, 보유 ${credits}). 설정에서 본인 Gemini 키를 등록해 무제한 사용도 가능해요.`
          );
        }
        tx.update(userRef, { credits: credits - SET_COST });
      });
    }

    // 시드 이미지 다운로드
    const bucket = getStorage().bucket();
    const [seedBuffer] = await bucket.file(seedPath).download();

    const ai = new GoogleGenAI({
      apiKey: useBYOK ? byokApiKey!.trim() : GEMINI_API_KEY.value(),
    });
    const results: { slot: number; ok: boolean; path?: string; error?: string }[] = [];

    // 동시 4개씩 생성
    for (let i = 0; i < emotions.length; i += 4) {
      const batch = emotions.slice(i, i + 4);
      const settled = await Promise.allSettled(
        batch.map(async (em) => {
          const prompt = buildVariantPrompt(em);
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: seedBuffer.toString("base64"),
                    },
                  },
                ],
              },
            ],
          });
          const b64 = extractImage(response);
          if (!b64) throw new Error("이미지 응답 없음");
          const slotPath = `users/${userId}/projects/${projectId}/raw/${String(em.slot).padStart(
            2,
            "0"
          )}-${em.label}.png`;
          await bucket.file(slotPath).save(Buffer.from(b64, "base64"), {
            contentType: "image/png",
          });
          // 스티커 메타데이터 기록
          await projectRef.collection("stickers").doc(`slot-${em.slot}`).set({
            slot: em.slot,
            emotionLabel: em.label,
            originalPath: slotPath,
            generationMethod: "ai",
            createdAt: new Date(),
          });
          return { slot: em.slot, path: slotPath };
        })
      );
      for (let j = 0; j < settled.length; j++) {
        const s = settled[j];
        const em = batch[j];
        if (s.status === "fulfilled") {
          results.push({ slot: em.slot, ok: true, path: s.value.path });
        } else {
          results.push({ slot: em.slot, ok: false, error: String(s.reason) });
        }
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    await projectRef.update({
      status: successCount === emotions.length ? "completed" : "partial",
      successCount,
      updatedAt: new Date(),
    });

    // 거래 기록 — BYOK는 0 크레딧으로 audit만 남김
    await db.collection("credits").doc("transactions").collection("items").add({
      userId,
      amount: useBYOK ? 0 : -SET_COST,
      type: useBYOK ? "byok" : "consume",
      note: useBYOK
        ? `세트 생성 — BYOK (${successCount}/${emotions.length} 성공)`
        : `32종 세트 생성 (${successCount}/${emotions.length} 성공)`,
      relatedProjectId: projectId,
      createdAt: new Date(),
    });

    logger.info(
      `세트 생성: ${userId}/${projectId} ${successCount}/${emotions.length} byok=${useBYOK}`
    );
    return { ok: true, results, successCount, byok: useBYOK };
  }
);

function buildSeedPrompt(description: string): string {
  return [
    `Create a single emoticon character based on this description: ${description}`,
    `Style: thick black outline, flat sticker illustration, transparent background, square 1:1 frame.`,
    `The character should have a clear identity that can be drawn consistently in 32 different expressions.`,
    `No text, no background.`,
  ].join("\n");
}

function buildVariantPrompt(em: { slot: number; label: string; action: string }): string {
  return [
    `Keep EXACTLY the same character as the reference image — same colors, proportions, distinctive features.`,
    `New action/expression: ${em.action}`,
    `Style: thick black outline, flat sticker illustration, transparent background, square 1:1 frame.`,
    `Do not change body proportions, color palette, or distinctive markings.`,
  ].join("\n");
}

function extractImage(response: unknown): string | null {
  // SDK 응답 구조: { candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] }}] }
  const r = response as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string } }> };
    }>;
  };
  for (const cand of r.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
  }
  return null;
}
