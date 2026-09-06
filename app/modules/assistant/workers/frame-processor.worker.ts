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
  /** 帧处理总耗时（ms），供性能遥测使用。 */
  processMs: number;
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

  // 整体兜底：任何异常都必须回包，否则主线程会一直等待（由超时兜底）
  void processFrame(bitmap, maxWidth, quality).catch(() => {
    postFailure("帧处理失败。");
  });
};

async function processFrame(
  bitmap: ImageBitmap,
  maxWidth: number,
  quality: number,
): Promise<void> {
  const startedAt = performance.now();
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

  // convertToBlob 是异步的，不阻塞事件循环
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  const buffer = await blob.arrayBuffer();
  const processMs = performance.now() - startedAt;

  postMessage(
    {
      ok: true,
      signature,
      buffer,
      processMs,
    } satisfies ProcessSuccess,
    [buffer],
  );
}

function postFailure(error: string): void {
  postMessage({ ok: false, error } satisfies ProcessFailure);
}
