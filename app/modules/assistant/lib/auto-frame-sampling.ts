import {
  FRAME_DIFF_SEND_THRESHOLD,
  shouldSendFrame,
  type FrameSignature,
} from "@/modules/assistant/lib/frame-diff";

/** 自动采样中一帧视觉上下文的固定提示语。 */
export const AUTO_FRAME_CONTEXT_PROMPT =
  "这是摄像头的最新画面，请作为后续对话的视觉上下文，不需要主动回应。";

export type AutoFrameTurnInput = {
  /** 本次采样捕获的帧；null 表示未能捕获画面。 */
  capturedFrame: { frameDataUrl: string; signature: FrameSignature } | null;
  /** 上次已上传帧的签名（用于帧差分去重）。 */
  lastUploadedSignature: FrameSignature | null;
};

export type AutoFrameTurnDecision =
  /** 未能捕获画面（无媒体/失败），本回合什么都不做。 */
  | { action: "no-frame" }
  /** 与上帧差异不足，跳过（不计入发送，也不更新基线）。 */
  | { action: "skip" }
  /** 有实质变化，应作为视觉上下文发送。 */
  | { action: "send"; frameDataUrl: string };

/**
 * 自动帧采样"单轮决策"纯函数。
 *
 * 给定本次捕获帧与上次上传帧签名，判断本回合动作：
 * - 未捕获到帧 → `no-frame`
 * - 与上帧差异不足阈值 → `skip`
 * - 有实质变化 → `send`（返回待发送帧数据）
 *
 * 该函数是 `useAutoFrameSampling` 的纯逻辑核心，便于独立单测。
 */
export function resolveAutoFrameTurn({
  capturedFrame,
  lastUploadedSignature,
}: AutoFrameTurnInput): AutoFrameTurnDecision {
  if (capturedFrame === null) {
    return { action: "no-frame" };
  }

  if (
    !shouldSendFrame(
      lastUploadedSignature,
      capturedFrame.signature,
      FRAME_DIFF_SEND_THRESHOLD,
    )
  ) {
    return { action: "skip" };
  }

  return { action: "send", frameDataUrl: capturedFrame.frameDataUrl };
}
