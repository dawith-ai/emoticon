import { onObjectFinalized } from "firebase-functions/v2/storage";
import { logger } from "firebase-functions/v2";
import sharp from "sharp";
import { getStorage } from "./admin";

/**
 * Storage 트리거 — `users/{uid}/projects/{pid}/raw/{slot}.png` 업로드 시
 * 4개 플랫폼 사이즈로 자동 변환해서 같은 프로젝트 폴더에 저장.
 *
 * 카카오 360x360 / OGQ 740x640 / LINE 370x320 / Etsy 1000x1000.
 *
 * 트리거 경로 매칭 패턴은 v2에서 옵션으로 지원되지만, 여기선 path 검사로 처리.
 */
const PLATFORM_SIZES: Array<{ name: string; width: number; height: number }> = [
  { name: "kakao", width: 360, height: 360 },
  { name: "ogq", width: 740, height: 640 },
  { name: "line", width: 370, height: 320 },
  { name: "etsy", width: 1000, height: 1000 },
];

export const processStickerVariants = onObjectFinalized(
  { region: "asia-northeast3", memory: "512MiB" },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath) return;

    // raw/ 경로만 처리
    const match = filePath.match(/^users\/([^/]+)\/projects\/([^/]+)\/raw\/(.+\.png)$/);
    if (!match) return;
    const [, userId, projectId, fileName] = match;

    const bucket = getStorage().bucket(event.data.bucket);
    const [buffer] = await bucket.file(filePath).download();

    await Promise.all(
      PLATFORM_SIZES.map(async (p) => {
        const resized = await sharp(buffer)
          .resize(p.width, p.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png({ compressionLevel: 9 })
          .toBuffer();

        const outPath = `users/${userId}/projects/${projectId}/${p.name}/${fileName}`;
        await bucket.file(outPath).save(resized, {
          contentType: "image/png",
          metadata: {
            cacheControl: "public, max-age=31536000",
            customMetadata: {
              platform: p.name,
              sourceWidth: String(p.width),
              sourceHeight: String(p.height),
            },
          },
        });
      })
    );

    logger.info(`멀티 플랫폼 변환 완료: ${filePath} → ${PLATFORM_SIZES.length}개 크기`);
  }
);
