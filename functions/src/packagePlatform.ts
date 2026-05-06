import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getStorage } from "./admin";
import archiver from "archiver";
import { PassThrough } from "stream";

/**
 * 플랫폼별 ZIP 패키징 — 변환된 PNG들을 ZIP으로 묶어 다운로드 URL 반환.
 *
 * 주의: archiver를 의존성에 추가해야 함 (TODO: package.json 업데이트 시 추가)
 *       당장은 스텁으로 두고, 실제 ZIP 묶음은 다음 sprint에서 구현.
 */
type PackageRequest = {
  projectId: string;
  platform: "kakao" | "ogq" | "line" | "etsy";
};

export const packagePlatform = onCall(
  { region: "asia-northeast3", timeoutSeconds: 120, memory: "512MiB" },
  async (req) => {
    const userId = req.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "로그인 필요");

    const { projectId, platform } = req.data as PackageRequest;
    if (!projectId || !platform) {
      throw new HttpsError("invalid-argument", "projectId, platform 필수");
    }

    const bucket = getStorage().bucket();
    const platformPrefix = `users/${userId}/projects/${projectId}/${platform}/`;
    const [files] = await bucket.getFiles({ prefix: platformPrefix });
    if (files.length === 0) {
      throw new HttpsError("not-found", `${platform} 변환 파일이 없음`);
    }

    const zipPath = `users/${userId}/projects/${projectId}/packages/${platform}.zip`;
    const zipFile = bucket.file(zipPath);

    const passthrough = new PassThrough();
    const writeStream = zipFile.createWriteStream({
      contentType: "application/zip",
      metadata: { cacheControl: "private, max-age=3600" },
    });

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(passthrough);
    passthrough.pipe(writeStream);

    for (const file of files) {
      const [buf] = await file.download();
      const name = file.name.split("/").pop()!;
      archive.append(buf, { name });
    }
    await archive.finalize();
    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", () => resolve());
      writeStream.on("error", reject);
    });

    // signed URL (1시간 유효)
    const [url] = await zipFile.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });

    logger.info(`ZIP 패키징 완료: ${zipPath} (${files.length} 파일)`);
    return { ok: true, url, fileCount: files.length };
  }
);
