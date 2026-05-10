/**
 * 카카오 작가 신청 사양 검증 — 클라이언트 사이드, Canvas + 헤더 파싱만 사용.
 *
 * 정지 이모티콘: PNG 360×360, 투명 배경, < 150KB
 * 움직이는 이모티콘: GIF 360×360, 24fps × 1초 = 24프레임 이하, < 1MB
 *
 * 외부 deps: jszip(이미 등재), 그 외 sharp 등 서버 라이브러리 사용 금지.
 */

const KAKAO_DIMENSION = 360;
const STATIC_MAX_BYTES = 150 * 1024; // 150KB
const ANIMATED_MAX_BYTES = 1024 * 1024; // 1MB
const ANIMATED_MAX_FRAMES = 24;
const ANIMATED_MIN_FRAMES = 1;
const EDGE_ALPHA_TOLERANCE = 4; // 가장자리 alpha 허용 잔여 (0이 이상)

export type SpecCheck = { ok: boolean; reason?: string };

export type SpecReport = {
  /** PNG / GIF mime 또는 시그니처 검증 */
  fileType: SpecCheck;
  /** 정지: 360x360, 움직이는: 360x360 (GIF 헤더 파싱) */
  dimensions: SpecCheck;
  /** 정지 < 150KB / 움직이는 < 1MB */
  fileSize: SpecCheck;
  /** PNG 투명 채널 + 가장자리 alpha 0 (정지) / GIF 투명 인덱스 (움직이는) */
  transparency: SpecCheck;
  /** GIF 24fps × 1초 = 24 프레임 이하. 정적은 undefined */
  animatedFrames?: SpecCheck;
};

// ─── PNG 시그니처 + IHDR ────────────────────────────────────────

function readUint8(buf: ArrayBuffer, offset: number): number {
  return new DataView(buf).getUint8(offset);
}

function readUint32BE(buf: ArrayBuffer, offset: number): number {
  return new DataView(buf).getUint32(offset, false);
}

function isPngSignature(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 8) return false;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (readUint8(buf, i) !== sig[i]) return false;
  }
  return true;
}

type PngHeader = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number; // 0=gray, 2=RGB, 3=indexed, 4=GA, 6=RGBA
};

function readPngHeader(buf: ArrayBuffer): PngHeader | null {
  if (!isPngSignature(buf)) return null;
  if (buf.byteLength < 33) return null;
  // IHDR is the first chunk after signature
  // chunk: length(4) + type(4) + data + crc(4)
  // IHDR starts at offset 8, chunk type at 12, data at 16
  const view = new DataView(buf);
  const length = view.getUint32(8, false);
  if (length < 13) return null;
  const type = String.fromCharCode(
    view.getUint8(12),
    view.getUint8(13),
    view.getUint8(14),
    view.getUint8(15),
  );
  if (type !== "IHDR") return null;
  return {
    width: readUint32BE(buf, 16),
    height: readUint32BE(buf, 20),
    bitDepth: view.getUint8(24),
    colorType: view.getUint8(25),
  };
}

/** PNG 가장자리 alpha 검사 — Canvas로 디코드 후 1픽셀 테두리 alpha 평균 */
async function checkPngEdgeTransparency(blob: Blob): Promise<SpecCheck> {
  if (typeof document === "undefined") {
    return { ok: true, reason: "SSR 환경에서는 가장자리 검사 생략" };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadHtmlImage(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w === 0 || h === 0) {
      return { ok: false, reason: "이미지 크기 0" };
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return { ok: true, reason: "Canvas 컨텍스트 없음 — 검사 생략" };
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const top = ctx.getImageData(0, 0, w, 1).data;
    const bottom = ctx.getImageData(0, h - 1, w, 1).data;
    const left = ctx.getImageData(0, 0, 1, h).data;
    const right = ctx.getImageData(w - 1, 0, 1, h).data;

    let maxAlpha = 0;
    const scanAlpha = (data: Uint8ClampedArray) => {
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > maxAlpha) maxAlpha = data[i];
      }
    };
    scanAlpha(top);
    scanAlpha(bottom);
    scanAlpha(left);
    scanAlpha(right);

    if (maxAlpha > EDGE_ALPHA_TOLERANCE) {
      return {
        ok: false,
        reason: `가장자리 픽셀에 잔여 alpha=${maxAlpha} (0에 가까워야 함)`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return { ok: false, reason: `투명도 검사 실패: ${msg}` };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 디코드 실패"));
    img.src = url;
  });
}

// ─── GIF 시그니처 + LSD + 프레임 카운트 ─────────────────────────

function isGifSignature(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 6) return false;
  const view = new DataView(buf);
  const head = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
    view.getUint8(4),
    view.getUint8(5),
  );
  return head === "GIF87a" || head === "GIF89a";
}

type GifHeader = {
  width: number;
  height: number;
  /** Image Descriptor 블록 수 = 프레임 수 추정 */
  frameCount: number;
  /** Logical Screen Descriptor의 GCT 사용 여부 */
  hasGlobalColorTable: boolean;
  /** Graphic Control Extension에서 transparent flag가 한 번이라도 켜졌는지 */
  hasTransparentFlag: boolean;
};

/**
 * GIF 헤더/블록 파싱으로 width, height, frame count, transparency 추정.
 * 외부 라이브러리 없이 구현. LZW 디코드는 안 함.
 */
function readGifHeader(buf: ArrayBuffer): GifHeader | null {
  if (!isGifSignature(buf)) return null;
  if (buf.byteLength < 13) return null;
  const view = new DataView(buf);

  // LSD: bytes 6-12
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const packed = view.getUint8(10);
  const hasGCT = (packed & 0x80) !== 0;
  const gctSize = hasGCT ? 3 * (1 << ((packed & 0x07) + 1)) : 0;

  let cursor = 13 + gctSize;
  let frameCount = 0;
  let hasTransparentFlag = false;
  const len = buf.byteLength;

  // 안전 한계 (악성 GIF 대비): 100k 블록까지만 반복
  const MAX_BLOCKS = 100_000;
  let blocks = 0;

  while (cursor < len && blocks < MAX_BLOCKS) {
    blocks++;
    const marker = view.getUint8(cursor);
    if (marker === 0x3b) {
      // GIF trailer
      break;
    }
    if (marker === 0x21) {
      // Extension block
      cursor += 1;
      if (cursor >= len) break;
      const label = view.getUint8(cursor);
      cursor += 1;
      // Graphic Control Extension (0xF9) → transparent flag check
      if (label === 0xf9) {
        if (cursor + 6 > len) break;
        // block size (1) + packed(1) + delay(2) + transparent index(1) + terminator(1)
        const blockSize = view.getUint8(cursor);
        if (blockSize >= 4) {
          const gcePacked = view.getUint8(cursor + 1);
          if ((gcePacked & 0x01) !== 0) hasTransparentFlag = true;
        }
      }
      // Skip data sub-blocks
      cursor = skipSubBlocks(view, cursor, len);
      if (cursor < 0) break;
      continue;
    }
    if (marker === 0x2c) {
      // Image Descriptor
      frameCount += 1;
      if (cursor + 10 > len) break;
      const idPacked = view.getUint8(cursor + 9);
      const lctSize =
        (idPacked & 0x80) !== 0 ? 3 * (1 << ((idPacked & 0x07) + 1)) : 0;
      cursor += 10 + lctSize;
      if (cursor >= len) break;
      // LZW min code size
      cursor += 1;
      cursor = skipSubBlocks(view, cursor, len);
      if (cursor < 0) break;
      continue;
    }
    // Unknown marker — bail
    break;
  }

  return {
    width,
    height,
    frameCount,
    hasGlobalColorTable: hasGCT,
    hasTransparentFlag,
  };
}

/** GIF 데이터 sub-block들을 건너뛰고 다음 커서 반환. 실패 시 -1 */
function skipSubBlocks(view: DataView, start: number, len: number): number {
  let cursor = start;
  while (cursor < len) {
    const size = view.getUint8(cursor);
    cursor += 1;
    if (size === 0) return cursor;
    cursor += size;
  }
  return -1;
}

// ─── 검증 함수 ─────────────────────────────────────────────────

export async function validateStaticPng(blob: Blob): Promise<SpecReport> {
  const buf = await blob.arrayBuffer();
  const isPng = isPngSignature(buf);

  const fileType: SpecCheck = isPng
    ? { ok: true }
    : { ok: false, reason: "PNG 시그니처 아님 (정지는 PNG 권장)" };

  const fileSize: SpecCheck =
    blob.size <= STATIC_MAX_BYTES
      ? { ok: true }
      : {
          ok: false,
          reason: `${(blob.size / 1024).toFixed(1)}KB > 150KB 한계`,
        };

  if (!isPng) {
    return {
      fileType,
      dimensions: { ok: false, reason: "PNG 아님 — 크기 검사 생략" },
      fileSize,
      transparency: { ok: false, reason: "PNG 아님 — 투명도 검사 생략" },
    };
  }

  const header = readPngHeader(buf);
  const dimensions: SpecCheck = header
    ? header.width === KAKAO_DIMENSION && header.height === KAKAO_DIMENSION
      ? { ok: true }
      : {
          ok: false,
          reason: `${header.width}×${header.height} (360×360 필요)`,
        }
    : { ok: false, reason: "PNG IHDR 파싱 실패" };

  // PNG colorType 4(GA) 또는 6(RGBA) = alpha 채널 있음. 3(indexed)는 tRNS chunk 필요(여기선 통과 처리)
  const hasAlphaChannel =
    header !== null &&
    (header.colorType === 4 || header.colorType === 6 || header.colorType === 3);

  if (!hasAlphaChannel) {
    return {
      fileType,
      dimensions,
      fileSize,
      transparency: {
        ok: false,
        reason: `PNG colorType=${header?.colorType ?? "?"} → alpha 채널 없음`,
      },
    };
  }

  // 가장자리 픽셀 alpha 검사
  const transparency = await checkPngEdgeTransparency(blob);

  return { fileType, dimensions, fileSize, transparency };
}

export async function validateAnimatedGif(blob: Blob): Promise<SpecReport> {
  const buf = await blob.arrayBuffer();
  const isGif = isGifSignature(buf);

  const fileType: SpecCheck = isGif
    ? { ok: true }
    : { ok: false, reason: "GIF 시그니처 아님 (움직이는은 GIF 권장)" };

  const fileSize: SpecCheck =
    blob.size <= ANIMATED_MAX_BYTES
      ? { ok: true }
      : {
          ok: false,
          reason: `${(blob.size / 1024).toFixed(1)}KB > 1MB 한계`,
        };

  if (!isGif) {
    return {
      fileType,
      dimensions: { ok: false, reason: "GIF 아님 — 크기 검사 생략" },
      fileSize,
      transparency: { ok: false, reason: "GIF 아님 — 투명도 검사 생략" },
      animatedFrames: { ok: false, reason: "GIF 아님 — 프레임 검사 생략" },
    };
  }

  const header = readGifHeader(buf);
  const dimensions: SpecCheck = header
    ? header.width === KAKAO_DIMENSION && header.height === KAKAO_DIMENSION
      ? { ok: true }
      : {
          ok: false,
          reason: `${header.width}×${header.height} (360×360 필요)`,
        }
    : { ok: false, reason: "GIF LSD 파싱 실패" };

  const transparency: SpecCheck = header
    ? header.hasTransparentFlag
      ? { ok: true }
      : {
          ok: false,
          reason: "GCE transparent flag 없음 (투명 인덱스 권장)",
        }
    : { ok: false, reason: "GIF 파싱 실패" };

  const animatedFrames: SpecCheck = header
    ? header.frameCount >= ANIMATED_MIN_FRAMES &&
      header.frameCount <= ANIMATED_MAX_FRAMES
      ? { ok: true }
      : {
          ok: false,
          reason: `${header.frameCount} 프레임 (1-${ANIMATED_MAX_FRAMES} 사이 필요, 24fps × 1초)`,
        }
    : { ok: false, reason: "프레임 수 산출 실패" };

  return { fileType, dimensions, fileSize, transparency, animatedFrames };
}

export type SetSpecItem = {
  slot: number;
  static: SpecReport;
  animated?: SpecReport;
};

export async function validateSet(
  items: ReadonlyArray<{ slot: number; static: Blob; animated?: Blob }>,
): Promise<SetSpecItem[]> {
  const out: SetSpecItem[] = [];
  for (const it of items) {
    const staticReport = await validateStaticPng(it.static);
    const animated = it.animated
      ? await validateAnimatedGif(it.animated)
      : undefined;
    out.push({ slot: it.slot, static: staticReport, animated });
  }
  return out;
}

// ─── 신청용 ZIP 빌더 ─────────────────────────────────────────────

export type SubmissionMeta = {
  title: string;
  description: string;
};

export type SubmissionItem = {
  slot: number;
  static: Blob;
  animated?: Blob;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ.-]+/g, "_").slice(0, 60) || "slot";
}

/**
 * 카카오 신청 폴더 구조 ZIP:
 *   /static/01_<라벨>.png
 *   /animated/01_<라벨>.gif (있으면)
 *   /meta.json  (title, description, slot 목록)
 */
export async function buildSubmissionZip(
  items: ReadonlyArray<SubmissionItem>,
  meta: SubmissionMeta,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const maxSlot = items.reduce((acc, r) => Math.max(acc, r.slot), 0);
  const pad = String(maxSlot).length < 2 ? 2 : String(maxSlot).length;

  const staticFolder = zip.folder("static");
  const animatedFolder = zip.folder("animated");

  const slotEntries: Array<{
    slot: number;
    static: string;
    animated?: string;
  }> = [];

  for (const it of items) {
    const slotStr = String(it.slot).padStart(pad, "0");
    const baseName = sanitizeFileName(`${slotStr}_slot${it.slot}`);
    const staticName = `${baseName}.png`;
    staticFolder?.file(staticName, it.static);

    let animatedName: string | undefined;
    if (it.animated) {
      animatedName = `${baseName}.gif`;
      animatedFolder?.file(animatedName, it.animated);
    }
    slotEntries.push({
      slot: it.slot,
      static: `static/${staticName}`,
      animated: animatedName ? `animated/${animatedName}` : undefined,
    });
  }

  const metaPayload = {
    title: meta.title,
    description: meta.description,
    generatedAt: new Date().toISOString(),
    slots: slotEntries,
  };
  zip.file("meta.json", JSON.stringify(metaPayload, null, 2));

  return zip.generateAsync({ type: "blob" });
}
