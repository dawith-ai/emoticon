/**
 * 멀티 플랫폼 사이즈 변환 — 비율 유지 + 투명 패딩(contain)이 기본.
 * 카카오/OGQ/라인/Etsy 등 사양에 맞춰 한 장의 PNG를 여러 크기로 재생성한다.
 */

export type FitMode = "contain" | "cover" | "stretch";

export type ResizeTarget = {
  /** 출력 파일에 사용할 식별자(파일명 일부) */
  id: string;
  /** UI에 표시할 라벨 */
  label: string;
  width: number;
  height: number;
};

export type PlatformSpec = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** 카카오/라인 등 한 번에 만들어주는 변환 조합 */
  targets: ResizeTarget[];
};

export const PLATFORM_RESIZE_SPECS: PlatformSpec[] = [
  {
    id: "kakao-static",
    name: "카카오 이모티콘 (멈춤)",
    emoji: "💛",
    description: "360×360 PNG · 32장 권장 · ≤150KB · (작업 캔버스 1080×1080 @72dpi 권장)",
    targets: [
      { id: "kakao-360", label: "본 이미지", width: 360, height: 360 },
    ],
  },
  {
    id: "kakao-big",
    name: "카카오 큰 이모티콘",
    emoji: "🔵",
    description: "16개 · 기본 540×540 / 가로 540×300 / 세로 300×540",
    targets: [
      { id: "kakao-big-540", label: "기본형", width: 540, height: 540 },
      { id: "kakao-big-w", label: "가로형", width: 540, height: 300 },
      { id: "kakao-big-h", label: "세로형", width: 300, height: 540 },
    ],
  },
  {
    id: "kakao-mini",
    name: "카카오 미니 이모티콘",
    emoji: "🟡",
    description: "180×180 · 멈춤 42개 / 움직임 35개",
    targets: [
      { id: "kakao-mini-180", label: "본 이미지", width: 180, height: 180 },
    ],
  },
  {
    id: "ogq",
    name: "네이버 OGQ 스티커",
    emoji: "🟢",
    description: "본 740×640 + 메인 240×240 + 탭 96×74",
    targets: [
      { id: "ogq-740x640", label: "본 이미지", width: 740, height: 640 },
      { id: "ogq-main-240", label: "메인", width: 240, height: 240 },
      { id: "ogq-tab-96x74", label: "탭", width: 96, height: 74 },
    ],
  },
  {
    id: "line-sticker",
    name: "LINE 스티커",
    emoji: "💚",
    description: "본 370×320 + 메인 240×240 + 탭 96×74",
    targets: [
      { id: "line-370x320", label: "본 이미지", width: 370, height: 320 },
      { id: "line-main-240", label: "메인", width: 240, height: 240 },
      { id: "line-tab-96x74", label: "탭", width: 96, height: 74 },
    ],
  },
  {
    id: "line-emoji",
    name: "LINE 이모티콘 (Emoji)",
    emoji: "💚",
    description: "180×180 · 일반 8~40개 / 문자 104개",
    targets: [
      { id: "line-emoji-180", label: "본 이미지", width: 180, height: 180 },
    ],
  },
  {
    id: "between",
    name: "비트윈 (Between)",
    emoji: "💑",
    description: "512×512 · 정지 16/28/30, 움직임 12/16/24",
    targets: [
      { id: "between-512", label: "본 이미지", width: 512, height: 512 },
    ],
  },
  {
    id: "etsy",
    name: "Etsy 디지털 스티커",
    emoji: "🛍️",
    description: "1000×1000 (300dpi 권장)",
    targets: [
      { id: "etsy-1000", label: "본 이미지", width: 1000, height: 1000 },
    ],
  },
  {
    id: "redbubble",
    name: "Redbubble POD",
    emoji: "🌍",
    description: "굿즈용 고해상도 4500×5400",
    targets: [
      { id: "redbubble-4500", label: "POD 본 이미지", width: 4500, height: 5400 },
    ],
  },
  {
    id: "miricanvas",
    name: "미리캔버스 기여자",
    emoji: "🖼️",
    description: "1024×1024 (스톡 표준)",
    targets: [
      { id: "miri-1024", label: "본 이미지", width: 1024, height: 1024 },
    ],
  },
];

export function resizeImage(
  source: HTMLImageElement | HTMLCanvasElement,
  target: ResizeTarget,
  mode: FitMode = "contain",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const sw =
    (source as HTMLImageElement).naturalWidth ||
    (source as HTMLCanvasElement).width;
  const sh =
    (source as HTMLImageElement).naturalHeight ||
    (source as HTMLCanvasElement).height;

  if (mode === "stretch") {
    ctx.drawImage(source, 0, 0, target.width, target.height);
    return canvas;
  }

  const ratioSrc = sw / sh;
  const ratioDst = target.width / target.height;
  let dw = target.width;
  let dh = target.height;

  if (mode === "contain") {
    if (ratioSrc > ratioDst) {
      dh = target.width / ratioSrc;
    } else {
      dw = target.height * ratioSrc;
    }
  } else {
    // cover
    if (ratioSrc > ratioDst) {
      dw = target.height * ratioSrc;
    } else {
      dh = target.width / ratioSrc;
    }
  }
  const dx = (target.width - dw) / 2;
  const dy = (target.height - dh) / 2;

  if (mode === "cover") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, target.width, target.height);
    ctx.clip();
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(source, dx, dy, dw, dh);
  }
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG 변환 실패"))),
      "image/png",
    );
  });
}
