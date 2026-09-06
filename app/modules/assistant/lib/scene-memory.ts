/**
 * Pure scene-memory (M4.1) — 场景记忆（关键帧文字摘要）。
 *
 * 动机：视觉对话中，历史轮次反复携带完整图片会造成图像 input token 雪球
 * （5 轮对话约 2125 token，见 cost-model `estimateImageTokens`）。场景记忆用
 * 一句话文本摘要替代历史图片，仅最新帧仍以图片发送，可显著降本并保持场景连续性。
 *
 * 本模块是纯函数库：`SceneMemoryStore` 以不可变快照方式读写最近 N 个关键帧的
 * 一句话描述，并提供序列化文本上下文与成本节省估算，便于独立单测。
 */

import { estimateImageTokens } from "@/modules/assistant/lib/cost-model";

/** 场景记忆中的一条关键帧摘要。 */
export type SceneMemorySummary = {
  /** 摘要唯一标识（可用帧采样序号）。 */
  id: string;
  /** 一句话场景描述（由模型生成）。 */
  text: string;
  /** 关键帧采样时间戳（ms）。 */
  recordedAt: number;
  /** 该帧对应的估算图像 token（用于成本对比）。 */
  frameTokens: number;
};

/** 场景记忆存储配置。 */
export type SceneMemoryConfig = {
  /** 最多保留的关键帧摘要条数（超出时丢弃最旧）。 */
  maxSummaries: number;
  /** 每条摘要允许的最大文本长度（超出截断）。 */
  maxSummaryLength: number;
};

export const SCENE_MEMORY_DEFAULT_CONFIG: SceneMemoryConfig = {
  maxSummaries: 4,
  maxSummaryLength: 200,
};

/** 场景记忆的不可变快照。 */
export type SceneMemoryState = {
  summaries: readonly SceneMemorySummary[];
};

export function createInitialSceneMemoryState(): SceneMemoryState {
  return { summaries: [] };
}

/**
 * 截断一条摘要文本，防止过长文本挤占上下文。
 */
export function truncateSceneSummary(
  text: string,
  maxLength: number,
): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

/**
 * 向场景记忆中追加/替换一条关键帧摘要，保持不超过 maxSummaries 条。
 * 若 `id` 已存在则原地更新（最新帧刷新），否则追加到末尾；超出上限丢弃最旧。
 *
 * @returns 新的不可变快照
 */
export function addSceneSummary(
  state: SceneMemoryState,
  summary: SceneMemorySummary,
  config: SceneMemoryConfig = SCENE_MEMORY_DEFAULT_CONFIG,
): SceneMemoryState {
  const trimmedText = truncateSceneSummary(
    summary.text,
    config.maxSummaryLength,
  );

  if (trimmedText.length === 0) {
    return state;
  }

  const normalized: SceneMemorySummary = {
    ...summary,
    text: trimmedText,
  };

  const existingIndex = state.summaries.findIndex(
    (entry) => entry.id === summary.id,
  );

  let nextSummaries: readonly SceneMemorySummary[];

  if (existingIndex >= 0) {
    nextSummaries = state.summaries.map((entry, index) =>
      index === existingIndex ? normalized : entry,
    );
  } else {
    nextSummaries = [...state.summaries, normalized];
  }

  if (nextSummaries.length > config.maxSummaries) {
    nextSummaries = nextSummaries.slice(
      nextSummaries.length - config.maxSummaries,
    );
  }

  return { summaries: nextSummaries };
}

/**
 * 移除指定 id 的场景摘要（如会话切换/清空场景）。
 */
export function removeSceneSummary(
  state: SceneMemoryState,
  id: string,
): SceneMemoryState {
  return {
    summaries: state.summaries.filter((entry) => entry.id !== id),
  };
}

/**
 * 清空全部场景摘要（如切换会话/新会话）。
 */
export function clearSceneMemory(): SceneMemoryState {
  return createInitialSceneMemoryState();
}

/**
 * 把场景摘要序列化为注入给模型的低成本文本上下文。
 *
 * 格式示例：
 * ```
 * 此前画面（文字摘要）：
 * - 桌面上有一杯咖啡和打开的笔记本电脑
 * - 画面中心是一只橘猫
 * ```
 */
export function serializeSceneMemoryContext(
  state: SceneMemoryState,
): string {
  if (state.summaries.length === 0) {
    return "";
  }

  const lines = state.summaries.map((entry) => `- ${entry.text}`);

  return `此前画面（文字摘要）：\n${lines.join("\n")}`;
}

/**
 * 估算场景记忆带来的图像 token 节省。
 *
 * 旧方案：历史 N 帧全部以图片发送 → 图像 token 为各帧之和。
 * 新方案：历史帧以文本摘要发送，仅最新帧以图片发送 → 图像 token 仅最新帧。
 * 返回值 = 节省的图像 token 数。
 *
 * @param state 场景记忆快照
 * @param latestFrameTokens 最新一帧（本次仍以图片发送）的图像 token
 */
export function estimateSceneMemorySavings(
  state: SceneMemoryState,
  latestFrameTokens: number,
): number {
  const historicalFrameTokens = state.summaries.reduce(
    (total, entry) => total + entry.frameTokens,
    0,
  );

  // 最新帧不在历史摘要中（否则 double-count）；历史摘要替换掉的图像
  // 才构成节省。若历史摘要恰好包含了最新帧 id，则忽略该条的节省。
  const savings = historicalFrameTokens - latestFrameTokens;

  return savings > 0 ? savings : 0;
}

/**
 * 便捷工具：把一帧尺寸换算为 token，并组装一条可入库存的场景摘要。
 *
 * @param id 摘要 id
 * @param text 一句话场景描述
 * @param recordedAt 采样时间
 * @param width 帧宽度（像素）
 * @param height 帧高度（像素）
 */
export function buildSceneSummary(
  id: string,
  text: string,
  recordedAt: number,
  width: number,
  height: number,
): SceneMemorySummary {
  return {
    id,
    text,
    recordedAt,
    frameTokens: estimateImageTokens(width, height),
  };
}
