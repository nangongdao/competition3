/**
 * Text-history summarization — 文本历史摘要（客户端构建）。
 *
 * 动机：Realtime / Chat 的每次请求都会把完整对话历史作为 input 重新计费
 * （历史雪球，见 docs/roadmap.md §1）。场景记忆（M4.1）已把历史帧压缩为文字
 * 摘要；本模块把**更早的文本轮次**同样压缩为一段紧凑摘要，仅最近若干轮保留
 * 原文，从而在长对话中显著削减文本 input token，同时不破坏可见转写区。
 *
 * 设计取舍：与场景记忆一致，采用「客户端构建摘要 + 作为低成本文本上下文注入」
 * 而非删除历史转写条目，避免模型"遗忘"细节的 UX 风险；可见转写始终保留完整
 * 历史，摘要只影响发送给上游的上下文。
 *
 * 本模块是纯函数库，便于独立单测。
 */

import type { TranscriptEntry } from "@/modules/assistant/types";

/** 文本历史摘要配置。 */
export type TextHistoryConfig = {
  /**
   * 保留原文的最大对话轮次数（含 user + assistant 往返；越新越靠后）。
   * 更早的轮次将被压缩为摘要。为 0 时全部历史都进入摘要。
   */
  maxVerbatimTurns: number;
  /** 摘要文本允许的最大字符数（超出截断）。 */
  maxSummaryLength: number;
  /** 摘要中最多保留的（最旧段）轮次条数；超出部分直接丢弃。 */
  maxSummaryTurns: number;
  /** 摘要中每一轮的文本最大字符数（超出截断）。 */
  maxLineLength: number;
};

export const TEXT_HISTORY_DEFAULT_CONFIG: TextHistoryConfig = {
  maxVerbatimTurns: 6,
  maxSummaryLength: 400,
  maxSummaryTurns: 12,
  maxLineLength: 120,
};

/** 构建文本历史摘要的中间结果。 */
export type TextHistorySummaryResult = {
  /** 注入上下文的紧凑摘要文本；无可压缩历史时为空字符串。 */
  context: string;
  /** 被压缩进摘要的转写条数。 */
  summarizedEntryCount: number;
  /** 原文（仅被摘要覆盖的部分）的估算文本 token 数。 */
  fullTextTokens: number;
  /** 摘要文本的估算文本 token 数。 */
  summaryTextTokens: number;
  /** 本次压缩节省的估算文本 token 数（full − summary，非负）。 */
  savedTextTokens: number;
};

const TOKENS_PER_CHAR = 4;

/**
 * 估算一段文本的 token 数（粗略估计，中文约 1 字 ~1 token、英文约 4 字符
 * ~1 token，这里用统一的经验系数便于展示相对节省量）。
 */
export function estimateTextTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / TOKENS_PER_CHAR));
}

/**
 * 把转写条目压缩为紧凑的对话摘要。
 *
 * 策略：
 * 1. 从转写中过滤出对话轮次（user / assistant，忽略 system 提示）。
 * 2. 保留最近 `maxVerbatimTurns` 轮（从后向前数）的原文，不进入摘要。
 * 3. 更早的轮次按「user: … / assistant: …」成对压缩进摘要，按时间顺序排列，
 *    并在开头标注被压缩轮次数量；超出 `maxSummaryLength` 时从尾部截断。
 * 4. 无可压缩历史时返回空 context。
 */
export function buildTextHistorySummary(
  entries: readonly TranscriptEntry[],
  config: Partial<TextHistoryConfig> = TEXT_HISTORY_DEFAULT_CONFIG,
): TextHistorySummaryResult {
  const resolved: TextHistoryConfig = {
    ...TEXT_HISTORY_DEFAULT_CONFIG,
    ...config,
  };

  const conversation = entries.filter(
    (entry) => entry.speaker === "user" || entry.speaker === "assistant",
  );

  const summarizeCount = Math.max(0, conversation.length - resolved.maxVerbatimTurns);
  if (summarizeCount === 0) {
    return {
      context: "",
      summarizedEntryCount: 0,
      fullTextTokens: 0,
      summaryTextTokens: 0,
      savedTextTokens: 0,
    };
  }

  const older = conversation.slice(0, summarizeCount);
  const fullText = older
    .map((entry) => `${entry.speaker === "user" ? "user" : "assistant"}: ${entry.text}`)
    .join("\n");

  // 压缩：仅保留最旧的一段轮次（超出 maxSummaryTurns 的远古轮次丢弃），
  // 并把每一轮文本压缩为单行、截断到 maxLineLength，避免摘要被撑大。
  const summarizedOlder = older.slice(-resolved.maxSummaryTurns);
  const compactLines = summarizedOlder.map((entry) => {
    const speaker = entry.speaker === "user" ? "user" : "assistant";
    const singleLine = entry.text.replace(/\s+/g, " ").trim();
    const clamped =
      singleLine.length > resolved.maxLineLength
        ? `${singleLine.slice(0, resolved.maxLineLength)}…`
        : singleLine;
    return `${speaker}: ${clamped}`;
  });

  const droppedCount = older.length - summarizedOlder.length;
  const summaryText =
    `[此前 ${summarizeCount} 条对话摘要${droppedCount > 0 ? `，已略过最早 ${droppedCount} 条` : ""}]\n` +
    compactLines.join("\n");

  // 超出上限时从尾部（最旧在前，尾部即最新被压缩的）截断，保留开头摘要标记。
  const truncatedSummary =
    summaryText.length > resolved.maxSummaryLength
      ? `${summaryText.slice(0, resolved.maxSummaryLength)}…`
      : summaryText;

  const fullTokens = estimateTextTokens(fullText);
  const summaryTokens = estimateTextTokens(truncatedSummary);

  return {
    context: truncatedSummary,
    summarizedEntryCount: summarizeCount,
    fullTextTokens: fullTokens,
    summaryTextTokens: summaryTokens,
    savedTextTokens: Math.max(0, fullTokens - summaryTokens),
  };
}
