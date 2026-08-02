/// <reference lib="webworker" />

import {
  createFrameSignatureFromImageData,
  type FrameSignature,
} from "../lib/frame-diff";

declare const self: DedicatedWorkerGlobalScope;

type ProcessRequest = {
  bitmap: ImageBitmap;
  maxWidth: number;
  quality: number;
};

type ProcessSuccess = {
  ok: true;
  signature: FrameSignature;
  buffer: ArrayBuffer;
};

type ProcessFailure = {
  ok: false;
  error: string;
};

/**
 * 帧处理 Worker。
 *
 * 在独立线程完成像素读回、签名计算与 JPEG 编码，
 * 避免 getImageData/toDataURL 阻塞主线程渲染。
 */
self.onmessage = (event: MessageEvent<ProcessRequest>) => {
  const { bitmap, maxWidth, quality } = event.data;

  void processFrame(bitmap, maxWidth, quality);
};

async function processFrame(
  bitmap: ImageBitmap,
  maxWidth: number,
  quality: number,
): Promise<void> {
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  if (context === null) {
    bitmap.close();
    postFailure("无法创建 2D 上下文。");
    return;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imageData = context.getImageData(0, 0, width, height);
  const signature = createFrameSignatureFromImageData(imageData);

  try {
    // convertToBlob 是异步的，不阻塞事件循环
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const buffer = await blob.arrayBuffer();

    postMessage(
      {
        ok: true,
        signature,
        buffer,
      } satisfies ProcessSuccess,
      [buffer],
    );
  } catch {
    postFailure("无法编码画面。");
  }
}

function postFailure(error: string): void {
  postMessage({ ok: false, error } satisfies ProcessFailure);
}
