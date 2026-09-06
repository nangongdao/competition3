import { useCallback, type Dispatch, type MutableRefObject, type RefObject } from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import {
  buildCapturedFrame,
  computeFrameScale,
  resolveFrameCaptureNotice,
  type CapturedFrame,
} from "@/modules/assistant/lib/frame-capture";
import type { FrameSignature } from "@/modules/assistant/lib/frame-diff";
import { MAX_FRAME_WIDTH, sampleFrameOffThread } from "@/modules/assistant/lib/frame-processing";
import type { TranscriptSpeaker } from "@/modules/assistant/types";

export type UseFrameCaptureDeps = {
  /** 摄像头 / 麦克风是否已授权且有媒体流。 */
  hasMedia: boolean;
  /** 摄像头视频元素引用。 */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** 离屏采样画布元素引用。 */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 最近一次已上传帧签名 ref（供帧差分去重基线）。 */
  lastUploadedFrameSignatureRef: MutableRefObject<FrameSignature | null>;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** 追加一条转写条目。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
  ) => string;
  /** 可选：记录一次 Worker 帧处理耗时（性能遥测）。 */
  recordFrameSample?: (processMs: number) => void;
  /** 可选：记录一次采样事件（采样节拍遥测，用于采样帧率监控）。 */
  recordSampleTick?: (timestampMs: number) => void;
};

export type UseFrameCaptureResult = {
  /** 同步采样当前画面（主线程路径，供不支持 Worker 时回退）。 */
  captureFrame: (source: "manual" | "auto") => CapturedFrame | null;
  /** 异步采样当前画面（优先走 Worker 线程避免阻塞渲染）。 */
  captureFrameAsync: (
    source: "manual" | "auto",
  ) => Promise<CapturedFrame | null>;
  /** 记录一帧已上传（更新基线签名 + 计数）。 */
  recordUploadedFrame: (signature: FrameSignature) => void;
};

/**
 * 帧采样编排 hook。
 *
 * 收敛 `assistant-workspace.tsx` 中的 `captureFrame` / `captureFrameAsync` /
 * `recordUploadedFrame`：把「缩放计算 / 帧签名构建 / 手动提示文案」的决策委托
 * 给 `lib/frame-capture.ts` 纯函数，组件仅收集扁平依赖并接线 DOM 读回、dispatch
 * 与转写副作用。
 */
export function useFrameCapture({
  hasMedia,
  videoRef,
  canvasRef,
  lastUploadedFrameSignatureRef,
  dispatch,
  addTranscript,
  recordFrameSample,
  recordSampleTick,
}: UseFrameCaptureDeps): UseFrameCaptureResult {
  const captureFrame = useCallback(
    (source: "manual" | "auto"): CapturedFrame | null => {
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;

      if (
        !hasMedia ||
        videoElement === null ||
        canvasElement === null ||
        videoElement.videoWidth === 0 ||
        videoElement.videoHeight === 0
      ) {
        const notice = resolveFrameCaptureNotice(source, "no-media");

        if (notice !== null) {
          addTranscript("system", notice);
        }

        return null;
      }

      const scale = computeFrameScale(
        videoElement.videoWidth,
        videoElement.videoHeight,
        MAX_FRAME_WIDTH,
      );
      canvasElement.width = scale.width;
      canvasElement.height = scale.height;

      const context = canvasElement.getContext("2d");

      if (context === null) {
        const notice = resolveFrameCaptureNotice(source, "no-context");

        if (notice !== null) {
          addTranscript("system", notice);
        }

        return null;
      }

      context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

      const captured = buildCapturedFrame(
        canvasElement.toDataURL("image/jpeg", 0.72),
        context.getImageData(0, 0, canvasElement.width, canvasElement.height),
      );

      if (captured === null) {
        const notice = resolveFrameCaptureNotice(source, "analyze-failed");

        if (notice !== null) {
          addTranscript("system", notice);
        }

        return null;
      }

      dispatch({ type: "frame-sampled", dataUrl: captured.frameDataUrl });
      // 采样节拍遥测：同步路径也记录，保证采样帧率监控覆盖回退场景。
      recordSampleTick?.(performance.now());

      const successNotice = resolveFrameCaptureNotice(source, "success");

      if (successNotice !== null) {
        addTranscript("system", successNotice);
      }

      return captured;
    },
    [addTranscript, canvasRef, dispatch, hasMedia, recordSampleTick, videoRef],
  );

  const captureFrameAsync = useCallback(
    async (source: "manual" | "auto"): Promise<CapturedFrame | null> => {
      const videoElement = videoRef.current;

      if (
        !hasMedia ||
        videoElement === null ||
        videoElement.videoWidth === 0 ||
        videoElement.videoHeight === 0
      ) {
        return captureFrame(source);
      }

      // Worker 线程处理：避免 getImageData/toDataURL 阻塞主线程渲染。
      const offThreadResult = await sampleFrameOffThread(videoElement);

      if (offThreadResult !== null) {
        // 性能遥测：记录 Worker 帧处理耗时 + 采样节拍（仅离屏路径有精确计时）。
        recordFrameSample?.(offThreadResult.processMs);
        recordSampleTick?.(performance.now());
        dispatch({ type: "frame-sampled", dataUrl: offThreadResult.dataUrl });

        const notice = resolveFrameCaptureNotice(source, "success");

        if (notice !== null) {
          addTranscript("system", notice);
        }

        return {
          frameDataUrl: offThreadResult.dataUrl,
          signature: offThreadResult.signature,
        };
      }

      // 浏览器不支持 Worker 处理时回退到同步路径。
      return captureFrame(source);
    },
    [addTranscript, captureFrame, dispatch, hasMedia, recordFrameSample, recordSampleTick, videoRef],
  );

  const recordUploadedFrame = useCallback(
    (signature: FrameSignature): void => {
      lastUploadedFrameSignatureRef.current = signature;
      dispatch({ type: "frame-sent" });
    },
    [dispatch, lastUploadedFrameSignatureRef],
  );

  return {
    captureFrame,
    captureFrameAsync,
    recordUploadedFrame,
  };
}
