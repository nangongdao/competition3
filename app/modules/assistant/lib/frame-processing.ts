import type { FrameSignature } from "./frame-diff";

/** 帧缩放到该宽度后上传。 */
export const MAX_FRAME_WIDTH = 640;
/** JPEG 编码质量。 */
export const FRAME_JPEG_QUALITY = 0.72;

export type OffThreadFrameResult = {
  dataUrl: string;
  signature: FrameSignature;
};

type WorkerSuccessMessage = {
  ok: true;
  signature: FrameSignature;
  buffer: ArrayBuffer;
};

type WorkerErrorMessage = {
  ok: false;
  error: string;
};

let frameProcessor: Worker | null = null;

function getFrameProcessor(): Worker | null {
  if (frameProcessor !== null) {
    return frameProcessor;
  }

  try {
    frameProcessor = new Worker(
      new URL("../workers/frame-processor.worker.ts", import.meta.url),
      { type: "module" },
    );
    return frameProcessor;
  } catch {
    return null;
  }
}

function supportsOffThreadFrameProcessing(): boolean {
  return (
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof Worker !== "undefined"
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/**
 * 在 Worker 线程采样并处理一帧。
 *
 * 主线程仅执行 `createImageBitmap`（零拷贝取帧）后把位图转移给 Worker，
 * 由 Worker 完成像素读回、帧签名与 JPEG 编码，避免阻塞主线程渲染。
 *
 * @param video 摄像头视频元素
 * @returns 处理结果；浏览器不支持 Worker/OffscreenCanvas 时返回 null（调用方回退到同步路径）
 */
export function sampleFrameOffThread(
  video: HTMLVideoElement,
): Promise<OffThreadFrameResult | null> {
  const processor = getFrameProcessor();

  if (processor === null || !supportsOffThreadFrameProcessing()) {
    return Promise.resolve(null);
  }

  return createImageBitmap(video)
    .then((bitmap) =>
      new Promise<OffThreadFrameResult | null>((resolve) => {
        const onMessage = (event: MessageEvent<WorkerSuccessMessage | WorkerErrorMessage>): void => {
          processor.removeEventListener("message", onMessage);

          if (event.data.ok === false) {
            resolve(null);
            return;
          }

          const base64 = arrayBufferToBase64(event.data.buffer);
          resolve({
            dataUrl: `data:image/jpeg;base64,${base64}`,
            signature: event.data.signature,
          });
        };

        processor.addEventListener("message", onMessage);
        processor.postMessage(
          { bitmap, maxWidth: MAX_FRAME_WIDTH, quality: FRAME_JPEG_QUALITY },
          [bitmap],
        );
      }),
    )
    .catch(() => null);
}
