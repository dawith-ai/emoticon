import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  type FirebaseStorage,
} from "firebase/storage";
import { getFirebaseApp } from "./client";

let storage: FirebaseStorage | null = null;

export function getClientStorage(): FirebaseStorage | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!storage) storage = getStorage(app);
  return storage;
}

/**
 * 캔버스 PNG를 Firebase Storage에 업로드.
 * 경로: users/{uid}/projects/{pid}/raw/{slot}-{label}.png
 */
export async function uploadStickerPng(
  uid: string,
  projectId: string,
  slot: number,
  label: string,
  blob: Blob
): Promise<{ path: string; url: string } | null> {
  const s = getClientStorage();
  if (!s) return null;

  const safeLabel = label.replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ-]/g, "_");
  const path = `users/${uid}/projects/${projectId}/raw/${String(slot).padStart(
    2,
    "0"
  )}-${safeLabel}.png`;
  const ref = storageRef(s, path);
  await uploadBytes(ref, blob, { contentType: "image/png" });
  const url = await getDownloadURL(ref);
  return { path, url };
}

/** 캔버스를 PNG Blob으로 변환 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png"
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob 실패"))),
      type
    );
  });
}
