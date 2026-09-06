import type { FrameSignature } from "./frame-diff";

/** 帧缩放到该宽度后上传。 */
export const MAX_FRAME_WIDTH = 640;
/** JPEG 编码质量。 */
export const FRAME_JPEG_QUALITY = 0.72;
/** 等待 Worker 回包的超时上限，超时视为本次采样失败并回退。 */
export const FRAME_PROCESS_TIMEOUT_MS = 3_000;
/** 帧处理 Worker 池大小：连续采样时并发处理，避免单 Worker 消息串行阻塞。 */
export const FRAME_WORKER_POOL_SIZE = 2;

export type OffThreadFrameResult = {
  dataUrl: string;
  signature: FrameSignature;
  /** 帧处理总耗时（ms，Worker 侧计时）。 */
  processMs: number;
};

type WorkerSuccessMessage = {
  ok: true;
  signature: FrameSignature;
  buffer: ArrayBuffer;
  processMs: number;
};

type WorkerErrorMessage = {
  ok: false;
  error: string;
};

/**
 * 帧处理 Worker 池。
 *
 * 用轮询（round-robin）把采样任务分发给池内多个 Worker，使连续采样可并发处理，
 * 避免单个 Worker 的消息队列串行排队造成吞吐瓶颈；每个 Worker 独立持有、独立
 * 清理监听器。创建失败时降级为 null（由调用方回退到主线程同步采样）。
 */
class FrameProcessorPool {
  private readonly workers: readonly Worker[];
  private nextIndex = 0;

  private constructor(workers: readonly Worker[]) {
    this.workers = workers;
  }

  /**
   * 尝试创建 Worker 池。
   *
   * 至少成功创建一个 Worker 才返回池；全部创建失败返回 null（调用方回退同步路径）。
   * 创建过程中部分成功时，只保留成功创建的 Worker。
   */
  static create(size = FRAME_WORKER_POOL_SIZE): FrameProcessorPool | null {
    const created: Worker[] = [];

    for (let index = 0; index < size; index += 1) {
      try {
        const worker = new Worker(
          new URL("../workers/frame-processor.worker.ts", import.meta.url),
          { type: "module" },
        );
        created.push(worker);
      } catch {
        // 单个 Worker 创建失败不影响已成功的其余 Worker。
      }
    }

    if (created.length === 0) {
      return null;
    }

    return new FrameProcessorPool(created);
  }

  /** 轮询取下一个 Worker。 */
  next(): Worker | null {
    const worker = this.workers[this.nextIndex % this.workers.length];
    if (worker === undefined) {
      return null;
    }
    this.nextIndex += 1;
    return worker;
  }
}

let frameProcessorPool: FrameProcessorPool | null = null;

function getFrameProcessorPool(): FrameProcessorPool | null {
  if (frameProcessorPool !== null) {
    return frameProcessorPool;
  }

  frameProcessorPool = FrameProcessorPool.create();
  return frameProcessorPool;
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
 * 主线程仅执行 `createImageBitmap`（零拷贝取帧）后把位图转移给池内某个 Worker，
 * 由 Worker 完成像素读回、帧签名与 JPEG 编码，避免阻塞主线程渲染。
 *
 * 池内 Worker 按轮询分配，连续采样可并发处理。每次调用都带超时与 listener 清理：
 * 即使 Worker 内抛错或长时间无回包，也不会挂死调用方或累积事件监听器。
 *
 * @param video 摄像头视频元素
 * @returns 处理结果；浏览器不支持 Worker/OffscreenCanvas 或处理超时/失败时返回 null
 */
export function sampleFrameOffThread(
  video: HTMLVideoElement,
): Promise<OffThreadFrameResult | null> {
  const pool = getFrameProcessorPool();

  if (pool === null || !supportsOffThreadFrameProcessing()) {
    return Promise.resolve(null);
  }

  const processor = pool.next();

  if (processor === null) {
    return Promise.resolve(null);
  }

  return createImageBitmap(video)
    .then(
      (bitmap) =>
        new Promise<OffThreadFrameResult | null>((resolve) => {
          let settled = false;
          const timeoutId = window.setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            processor.removeEventListener("message", onMessage);
            resolve(null);
          }, FRAME_PROCESS_TIMEOUT_MS);

          const onMessage = (
            event: MessageEvent<WorkerSuccessMessage | WorkerErrorMessage>,
          ): void => {
            if (settled) {
              return;
            }
            settled = true;
            window.clearTimeout(timeoutId);
            processor.removeEventListener("message", onMessage);

            if (event.data.ok === false) {
              resolve(null);
              return;
            }

            const base64 = arrayBufferToBase64(event.data.buffer);
            resolve({
              dataUrl: `data:image/jpeg;base64,${base64}`,
              signature: event.data.signature,
              processMs: event.data.processMs,
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
