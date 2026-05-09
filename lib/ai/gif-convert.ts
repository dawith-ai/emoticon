/**
 * 클라이언트 사이드 MP4 → GIF 변환 헬퍼.
 *
 * 카카오 "움직이는 이모티콘" 규격(360x360, 24fps, 1초, 무한 루프)에 맞춰
 * ffmpeg.wasm으로 브라우저 안에서 직접 변환한다.
 *
 * - 모든 import는 "use client" 환경(브라우저)에서만 동적으로 이뤄짐.
 *   SSR 시 wasm을 로드하면 실패하므로, 이 모듈의 export는 반드시
 *   useEffect 내부 또는 사용자 이벤트 핸들러 안에서만 호출해야 한다.
 * - 첫 호출 시 ~30MB의 ffmpeg-core.js / ffmpeg-core.wasm을 jsDelivr에서
 *   다운로드한 뒤 toBlobURL로 동봉(CORS 우회). 같은 페이지 세션 안에서는
 *   FFmpeg 인스턴스를 재사용하여 두 번째 호출부터는 즉시 변환한다.
 *
 * 입력은 Blob 또는 원격 URL(string) 둘 다 지원. URL을 받으면 fetch + CORS로
 * 가져온 뒤 변환한다.
 */

export interface ConvertMp4ToGifOptions {
  /** 출력 가로 px. 기본 360 (카카오 규격) */
  width?: number;
  /** 출력 세로 px. 기본 360 (카카오 규격) */
  height?: number;
  /** 출력 프레임레이트. 기본 24 (카카오 규격) */
  fps?: number;
  /** 사용할 입력 구간 길이(초). 기본 1초 (카카오 규격: 24프레임) */
  duration?: number;
  /** 잘라내기 시작 시각(초). 기본 0 (영상 맨 앞) */
  startTime?: number;
  /** 0~1 사이 진행률 콜백. ffmpeg 자체 progress 이벤트를 그대로 전달 */
  onProgress?: (ratio: number) => void;
  /** 외부 abort 신호. 변환 시작 전에 취소되어 있으면 즉시 throw */
  signal?: AbortSignal;
}

const FFMPEG_CORE_VERSION = "0.12.10";
const FFMPEG_CDN_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

// FFmpeg 클래스의 정확한 타입은 동적 import 시점에 결정되므로,
// 모듈 외부에는 최소 타입 surface만 노출한다.
interface FFmpegLike {
  loaded: boolean;
  load(opts: { coreURL: string; wasmURL: string }): Promise<boolean>;
  on(
    event: "progress",
    cb: (data: { progress: number; time: number }) => void,
  ): void;
  off(
    event: "progress",
    cb: (data: { progress: number; time: number }) => void,
  ): void;
  writeFile(name: string, data: Uint8Array): Promise<boolean>;
  readFile(name: string): Promise<Uint8Array | string>;
  deleteFile(name: string): Promise<boolean>;
  exec(args: string[]): Promise<number>;
}

let ffmpegSingleton: FFmpegLike | null = null;
let ffmpegLoadPromise: Promise<FFmpegLike> | null = null;

async function loadFFmpeg(): Promise<FFmpegLike> {
  if (typeof window === "undefined") {
    throw new Error("ffmpeg.wasm은 브라우저에서만 로드할 수 있어요.");
  }
  if (ffmpegSingleton && ffmpegSingleton.loaded) {
    return ffmpegSingleton;
  }
  if (ffmpegLoadPromise) {
    return ffmpegLoadPromise;
  }

  ffmpegLoadPromise = (async (): Promise<FFmpegLike> => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ]);
    const ffmpeg = new FFmpeg() as unknown as FFmpegLike;
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    ]);
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegSingleton = ffmpeg;
    return ffmpeg;
  })();

  try {
    const ffmpeg = await ffmpegLoadPromise;
    return ffmpeg;
  } catch (err) {
    // 로딩 실패 시 다음 호출에서 재시도할 수 있도록 promise 캐시 비움.
    ffmpegLoadPromise = null;
    throw err;
  }
}

async function inputToUint8Array(input: Blob | string): Promise<Uint8Array> {
  const { fetchFile } = await import("@ffmpeg/util");
  if (typeof input === "string") {
    return fetchFile(input);
  }
  return fetchFile(input);
}

function ensureNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("GIF 변환이 취소되었어요");
  }
}

function buildPaletteFilter(width: number, height: number, fps: number): string {
  // split + palettegen + paletteuse 단일 패스 변환.
  // - max_colors=128: 카카오 사양상 1MB 미만으로 떨어뜨리는 데 도움.
  // - dither=bayer / bayer_scale=5: 적당한 품질-사이즈 절충.
  return [
    `fps=${fps}`,
    `scale=${width}:${height}:flags=lanczos`,
    "split[s0][s1]",
    "[s0]palettegen=max_colors=128[p]",
    "[s1][p]paletteuse=dither=bayer:bayer_scale=5",
  ].join(",");
}

/**
 * 입력 MP4(Blob 또는 URL)를 GIF Blob으로 변환한다.
 *
 * @example
 * const gifBlob = await convertMp4ToGif(mp4Url, {
 *   width: 360, height: 360, fps: 24, duration: 1,
 *   onProgress: (r) => console.log(`${Math.round(r * 100)}%`),
 * });
 */
export async function convertMp4ToGif(
  input: Blob | string,
  options: ConvertMp4ToGifOptions = {},
): Promise<Blob> {
  const width = options.width ?? 360;
  const height = options.height ?? 360;
  const fps = options.fps ?? 24;
  const duration = options.duration ?? 1;
  const startTime = options.startTime ?? 0;

  ensureNotAborted(options.signal);

  const ffmpeg = await loadFFmpeg();
  ensureNotAborted(options.signal);

  // 충돌 방지를 위해 호출마다 고유한 파일명 사용.
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputName = `input-${tag}.mp4`;
  const outputName = `output-${tag}.gif`;

  const data = await inputToUint8Array(input);
  ensureNotAborted(options.signal);

  await ffmpeg.writeFile(inputName, data);

  const onProgress = options.onProgress;
  const progressHandler = ({ progress }: { progress: number; time: number }) => {
    if (!onProgress) return;
    // ffmpeg.wasm은 가끔 0~1 범위를 벗어난 값을 보고하므로 클램프.
    const clamped = Math.max(0, Math.min(1, progress));
    onProgress(clamped);
  };
  if (onProgress) {
    ffmpeg.on("progress", progressHandler);
  }

  try {
    const args: string[] = [
      "-ss",
      String(startTime),
      "-t",
      String(duration),
      "-i",
      inputName,
      "-vf",
      buildPaletteFilter(width, height, fps),
      "-loop",
      "0",
      "-f",
      "gif",
      outputName,
    ];

    const exitCode = await ffmpeg.exec(args);
    ensureNotAborted(options.signal);
    if (exitCode !== 0) {
      throw new Error(`ffmpeg가 비정상 종료되었어요 (code ${exitCode})`);
    }

    const fileData = await ffmpeg.readFile(outputName);
    if (typeof fileData === "string") {
      throw new Error("GIF 파일을 바이너리로 읽지 못했어요");
    }
    // fileData는 Uint8Array. ffmpeg.wasm 타입은 ArrayBufferLike(Shared 가능)로
    // 정의돼 있어 strict 모드에서 BlobPart로 직접 넘기면 충돌하므로,
    // 새 ArrayBuffer로 복사해 안전하게 감싸 반환한다.
    const copy = new Uint8Array(fileData.byteLength);
    copy.set(fileData);
    return new Blob([copy.buffer], { type: "image/gif" });
  } finally {
    if (onProgress) {
      ffmpeg.off("progress", progressHandler);
    }
    // 다음 호출에서 같은 이름이 남아 있어도 문제없도록 정리.
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // 무시: 이미 삭제됐거나 쓰여지기 전에 throw 됐을 수 있음.
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // 무시
    }
  }
}

/**
 * 테스트 / 개발 시 메모리 회수가 필요할 때만 호출.
 * 일반 사용 흐름에서는 호출하지 않아도 된다 — 페이지 언로드 시 GC됨.
 */
export function disposeFFmpeg(): void {
  ffmpegSingleton = null;
  ffmpegLoadPromise = null;
}
