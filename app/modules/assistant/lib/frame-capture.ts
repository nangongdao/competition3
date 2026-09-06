import {
  createFrameSignatureFromImageData,
  type FrameImageData,
  type FrameSignature,
} from "./frame-diff";

/**
 * 帧采样编排的纯决策层。
 *
 * `assistant-workspace.tsx` 中的 `captureFrame` / `captureFrameAsync` /
 * `recordUploadedFrame` 此前为内联的「读 DOM → 决策 → 副作用」编排，不可测。
 * 与 M1.12-M1.15 同理，把其中的纯计算（画布缩放、帧签名构建、手动采样
 * 提示文案）抽为可单测纯函数；DOM 读回与 dispatch / 转写副作用由
 * `hooks/use-frame-capture.ts` 接线执行。
 */

/** 一帧采样结果（画面 dataUrl + 帧签名）。 */
export type CapturedFrame = {
  frameDataUrl: string;
  signature: FrameSignature;
};

/** 手动采样各阶段的结果（用于决定是否提示 / 提示文案）。 */
export type FrameCaptureOutcome =
  | "no-media"
  | "no-context"
  | "analyze-failed"
  | "success";

/**
 * 计算把视频帧缩放后画布的目标尺寸。
 *
 * 仅在视频宽度超过 `maxWidth` 时等比缩小；否则保持原始尺寸。
 * 与内联实现一致：`scale = min(1, maxWidth / videoWidth)`。
 */
export function computeFrameScale(
  videoWidth: number,
  videoHeight: number,
  maxWidth: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / videoWidth);

  return {
    width: Math.round(videoWidth * scale),
    height: Math.round(videoHeight * scale),
  };
}

/**
 * 从画布 dataUrl + 原始像素数据构建一帧采样结果。
 *
 * 帧签名解析失败（画面数据异常）时返回 null，由调用方决定提示与回退。
 */
export function buildCapturedFrame(
  dataUrl: string,
  imageData: FrameImageData,
): CapturedFrame | null {
  try {
    return {
      frameDataUrl: dataUrl,
      signature: createFrameSignatureFromImageData(imageData),
    };
  } catch {
    return null;
  }
}

/**
 * 手动采样在各阶段应展示的系统提示；auto 采样不展示任何提示。
 *
 * - `no-media`：摄像头未授权 / 画面未就绪。
 * - `no-context`：浏览器无法读取画布。
 * - `analyze-failed`：帧签名解析失败。
 * - `success`：采样成功。
 */
export function resolveFrameCaptureNotice(
  source: "manual" | "auto",
  outcome: FrameCaptureOutcome,
): string | null {
  if (source !== "manual") {
    return null;
  }

  switch (outcome) {
    case "no-media":
      return "请先授权摄像头后再采样画面。";
    case "no-context":
      return "当前浏览器无法读取画面。";
    case "analyze-failed":
      return "无法分析当前画面，请重试。";
    case "success":
      return "已采样当前画面。";
  }
}
