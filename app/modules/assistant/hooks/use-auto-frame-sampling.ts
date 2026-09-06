import { useEffect, type MutableRefObject } from "react";

import { type FrameSignature } from "@/modules/assistant/lib/frame-diff";
import {
  AUTO_FRAME_CONTEXT_PROMPT,
  resolveAutoFrameTurn,
} from "@/modules/assistant/lib/auto-frame-sampling";

export type CapturedFrame = {
  frameDataUrl: string;
  signature: FrameSignature;
};

export type UseAutoFrameSamplingOptions = {
  /** 是否开启自动采样。 */
  enabled: boolean;
  /** 是否处于活跃会话（phase 为活跃）。 */
  hasActiveSession: boolean;
  /** 是否有可用媒体（摄像头已授权且有流）。 */
  hasMedia: boolean;
  /** 是否有 Realtime 连接。 */
  hasRealtimeConnection: boolean;
  /** 采样间隔（秒）。 */
  intervalSeconds: number;
  /** 上次已上传帧的签名 ref（由外部持有，供帧差分去重）。 */
  lastUploadedFrameSignatureRef: MutableRefObject<FrameSignature | null>;
  /** 捕获当前画面（异步，优先走 Worker 线程）。 */
  captureFrameAsync: (source: "manual" | "auto") => Promise<CapturedFrame | null>;
  /** 记录一帧已上传（更新基线签名 + 计数）。 */
  recordUploadedFrame: (signature: FrameSignature) => void;
  /** 发送视觉上下文到 Realtime 会话。 */
  sendVisualContext: (input: {
    frameDataUrl: string;
    prompt: string;
    requestResponse: boolean;
  }) => boolean;
  /** 一帧因与上帧差异不足被跳过时触发。 */
  onFrameSkipped: () => void;
};

/**
 * 自动帧采样 hook。
 *
 * 在满足条件（开启自动采样、活跃会话、有媒体、有 Realtime 连接）时，
 * 按 `intervalSeconds` 周期捕获画面，并用帧差分判断是否有实质变化：
 * 有变化则作为视觉上下文发送到会话；无变化则跳过（计入跳帧统计）。
 *
 * 采样被**串行化**：上一次采样未完成时不会启动下一次，避免旧帧晚回
 * 覆盖新帧基线，导致漏发或重复发。
 *
 * @param options 见 {@link UseAutoFrameSamplingOptions}。
 */
export function useAutoFrameSampling({
  enabled,
  hasActiveSession,
  hasMedia,
  hasRealtimeConnection,
  intervalSeconds,
  lastUploadedFrameSignatureRef,
  captureFrameAsync,
  recordUploadedFrame,
  sendVisualContext,
  onFrameSkipped,
}: UseAutoFrameSamplingOptions): void {
  useEffect(() => {
    if (!enabled || !hasActiveSession || !hasMedia || !hasRealtimeConnection) {
      return;
    }

    // 串行化自动采样：避免上一次未完成时下一次采样返回后按错误顺序
    // 覆盖基线（旧帧晚回会覆盖新帧基线，导致漏发或重复发）。
    let isCaptureInFlight = false;

    const timerId = window.setInterval(() => {
      if (isCaptureInFlight) {
        return;
      }

      isCaptureInFlight = true;
      void (async (): Promise<void> => {
        try {
          const capturedFrame = await captureFrameAsync("auto");

          const decision = resolveAutoFrameTurn({
            capturedFrame,
            lastUploadedSignature: lastUploadedFrameSignatureRef.current,
          });

          if (decision.action === "no-frame" || decision.action === "skip") {
            if (decision.action === "skip") {
              onFrameSkipped();
            }
            return;
          }

          const sent = sendVisualContext({
            frameDataUrl: decision.frameDataUrl,
            prompt: AUTO_FRAME_CONTEXT_PROMPT,
            requestResponse: false,
          });

          if (sent && capturedFrame !== null) {
            recordUploadedFrame(capturedFrame.signature);
          }
        } finally {
          isCaptureInFlight = false;
        }
      })();
    }, intervalSeconds * 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [
    captureFrameAsync,
    hasActiveSession,
    hasMedia,
    hasRealtimeConnection,
    enabled,
    intervalSeconds,
    lastUploadedFrameSignatureRef,
    onFrameSkipped,
    recordUploadedFrame,
    sendVisualContext,
  ]);
}
