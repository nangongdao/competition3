/**
 * Multimodal turn fusion (M4.2) — 多模态输入融合。
 *
 * 动机：语音、文本、画面当前为三条独立路径。用户连续语音对话中说话时，若
 * 画面恰好变化，会被拆成两次调用（语音轮 + 画面帧轮），增加 API 往返、延迟
 * 与图像 token 成本。本模块在"用户说话"与"画面变化"并发发生时把二者（连同
 * M4.1 场景记忆上下文）合并为单次多模态请求。
 *
 * 本模块为纯函数：`buildMultimodalTurn` 依据语音结束时间与帧捕获时间的并发
 * 窗口判定是否需要融合，输出统一的融合请求结构；`compareFusionStrategies`
 * 提供"融合 vs 分离"的调用次数与图像成本对比，作为验收数据。
 */

import { estimateImageTokens } from "@/modules/assistant/lib/cost-model";

/** 融合判定默认时间窗口（ms）：帧捕获距语音结束在此范围内视为并发。 */
export const DEFAULT_FUSION_WINDOW_MS = 1500;

export type MultimodalFrame = {
  /** 帧数据 URL（data:image/...）。 */
  readonly dataUrl: string;
  /** 帧捕获时间戳（ms）。 */
  readonly capturedAt: number;
  /** 可选帧宽度（像素），用于成本估算。 */
  readonly width?: number;
  /** 可选帧高度（像素），用于成本估算。 */
  readonly height?: number;
};

export type MultimodalTurnStrategy =
  | "fused-multimodal"
  | "text-only"
  | "image-only"
  | "empty";

export type MultimodalTurn = {
  /** 融合后的消息文本（语音转写，若存在）。 */
  readonly message: string;
  /** 融合后的图像（若存在并发帧）。 */
  readonly imageDataUrl?: string;
  /** 场景记忆文本上下文（M4.1）。 */
  readonly sceneContext?: string;
  /** 是否发生了"语音 + 画面"融合。 */
  readonly fused: boolean;
  /** 请求策略。 */
  readonly strategy: MultimodalTurnStrategy;
};

export type FusionStrategyComparison = {
  /** 融合方案的 API 调用次数。 */
  readonly fusedCallCount: number;
  /** 分离方案的 API 调用次数。 */
  readonly separateCallCount: number;
  /** 融合方案节省的调用次数。 */
  readonly savedCallCount: number;
  /** 融合方案的图像 token（并发帧若被融合则计一次）。 */
  readonly fusedImageTokens: number;
  /** 分离方案的图像 token。 */
  readonly separateImageTokens: number;
  /** 融合方案节省的图像 token。 */
  readonly savedImageTokens: number;
  /** 文字说明，便于记录到验收日志。 */
  readonly note: string;
};

function isNonEmptyText(text: string): boolean {
  return text.trim().length > 0;
}

function isFusionCandidate(
  frame: MultimodalFrame | undefined,
  utteranceEndAt: number | undefined,
  fusionWindowMs: number,
): boolean {
  if (frame === undefined) {
    return false;
  }

  // 无语音结束时间时，认为帧可直接并入当前轮（有帧即候选）。
  if (utteranceEndAt === undefined) {
    return true;
  }

  const elapsed = Math.abs(utteranceEndAt - frame.capturedAt);
  return elapsed <= fusionWindowMs;
}

/**
 * 构建一轮多模态请求。
 *
 * @param transcript 语音转写文本（可空）。
 * @param options.frame 可选的并发帧（画面变化）。
 * @param options.sceneContext 场景记忆文本上下文（M4.1）。
 * @param options.utteranceEndAt 语音结束时间戳（ms），用于并发判定。
 * @param options.fusionWindowMs 并发时间窗口（默认 `DEFAULT_FUSION_WINDOW_MS`）。
 */
export function buildMultimodalTurn(
  transcript: string,
  options: {
    frame?: MultimodalFrame;
    sceneContext?: string;
    utteranceEndAt?: number;
    fusionWindowMs?: number;
  } = {},
): MultimodalTurn {
  const trimmed = transcript.trim();
  const hasText = isNonEmptyText(trimmed);
  const fusionWindowMs =
    options.fusionWindowMs !== undefined &&
    Number.isFinite(options.fusionWindowMs) &&
    options.fusionWindowMs > 0
      ? options.fusionWindowMs
      : DEFAULT_FUSION_WINDOW_MS;

  const frameCandidate = isFusionCandidate(
    options.frame,
    options.utteranceEndAt,
    fusionWindowMs,
  )
    ? options.frame
    : undefined;

  const hasFrame = frameCandidate !== undefined;
  const sceneContext = options.sceneContext?.trim();
  const hasScene = isNonEmptyText(sceneContext ?? "");

  // 语音 + 并发画面 → 融合为单次多模态请求。
  if (hasText && hasFrame) {
    return {
      message: trimmed,
      imageDataUrl: frameCandidate.dataUrl,
      ...(hasScene ? { sceneContext } : {}),
      fused: true,
      strategy: "fused-multimodal",
    };
  }

  // 仅语音 → 纯文本请求。
  if (hasText) {
    return {
      message: trimmed,
      ...(hasScene ? { sceneContext } : {}),
      fused: false,
      strategy: "text-only",
    };
  }

  // 仅画面变化 → 纯图像请求（无用户语音）。
  if (hasFrame) {
    return {
      message: "",
      imageDataUrl: frameCandidate.dataUrl,
      fused: false,
      strategy: "image-only",
    };
  }

  return {
    message: "",
    fused: false,
    strategy: "empty",
  };
}

/**
 * 估算融合帧的图像 token（复用 cost-model 的分块规则）。
 */
export function estimateFusedFrameTokens(frame: MultimodalFrame): number {
  if (
    frame.width === undefined ||
    frame.height === undefined ||
    !Number.isFinite(frame.width) ||
    !Number.isFinite(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    return 0;
  }

  return estimateImageTokens(frame.width, frame.height);
}

/**
 * 对比"融合"与"分离"两种策略的调用次数与图像成本。
 *
 * 融合：语音 + 帧合并为 1 次调用，图像 token 记 1 帧。
 * 分离：语音 1 次 + 帧 1 次 = 2 次调用，图像 token 记 1 帧（帧仍只发一次，
 * 只是多了一次往返）。本对比主要量化调用次数与往返节省。
 */
export function compareFusionStrategies(
  turn: MultimodalTurn,
  frame?: MultimodalFrame,
): FusionStrategyComparison {
  const hasFrame = frame !== undefined;
  const fusedCallCount = turn.fused ? 1 : hasFrame ? 1 : turn.strategy === "text-only" ? 1 : 0;

  const separateCallCount =
    turn.strategy === "fused-multimodal"
      ? 2
      : turn.strategy === "text-only"
        ? 1
        : turn.strategy === "image-only"
          ? 1
          : 0;

  const fusedImageTokens = turn.fused
    ? frame !== undefined
      ? estimateFusedFrameTokens(frame)
      : 0
    : 0;

  const separateImageTokens = turn.fused
    ? frame !== undefined
      ? estimateFusedFrameTokens(frame)
      : 0
    : 0;

  const savedCallCount = Math.max(0, separateCallCount - fusedCallCount);

  // 图像 token 在两种方案下都只发最新一帧，节省主要体现在调用往返。
  const savedImageTokens = 0;

  const note =
    turn.fused
      ? `融合：语音与画面合并为 ${fusedCallCount} 次请求（省 ${savedCallCount} 次往返），图像 token 与分离持平（${fusedImageTokens}）。`
      : `未融合：策略=${turn.strategy}，调用 ${fusedCallCount} 次，图像 token ${fusedImageTokens}。`;

  return {
    fusedCallCount,
    separateCallCount,
    savedCallCount,
    fusedImageTokens,
    separateImageTokens,
    savedImageTokens,
    note,
  };
}

/**
 * 便捷工具：把一帧封装为 MultimodalFrame。
 */
export function toMultimodalFrame(
  dataUrl: string,
  capturedAt: number,
  width?: number,
  height?: number,
): MultimodalFrame {
  return {
    dataUrl,
    capturedAt,
    ...(width !== undefined && width > 0 ? { width } : {}),
    ...(height !== undefined && height > 0 ? { height } : {}),
  };
}
