/**
 * 会话级用量持久化的纯函数层。
 *
 * 收敛 `use-realtime-usage-collector` / `use-chat-usage-collector` 中
 * 「D1 持久化汇总（`UsageTotals`）→ 内存用量报告」的映射逻辑为可单测纯函数，
 * 并补充 Chat / Realtime 用量写入 D1 前的参数规范化。
 *
 * 全部为纯对象映射，不触发副作用。
 */

import type { UsageBuckets } from "@/modules/assistant/lib/cost-model";
import type {
  RecordUsageParams,
  UsageTotals,
} from "@/modules/assistant/lib/session-client";

/**
 * 把 D1 持久化的会话累计用量汇总映射为 `UsageBuckets`（Realtime 报告结构）。
 *
 * 用于会话切换 / 刷新后从 `getSessionUsage().totals` 回填成本面板，
 * 使跨会话累计用量在重新打开某会话后依然可见。
 */
export function usageTotalsToBuckets(totals: UsageTotals): UsageBuckets {
  return {
    inputTokens: totals.inputTokens,
    inputTextTokens: totals.inputTextTokens,
    inputAudioTokens: totals.inputAudioTokens,
    inputImageTokens: totals.inputImageTokens,
    cachedInputTokens: totals.cachedInputTokens,
    cachedTextTokens: totals.cachedTextTokens,
    cachedAudioTokens: totals.cachedAudioTokens,
    cachedImageTokens: totals.cachedImageTokens,
    outputTokens: totals.outputTokens,
    outputTextTokens: totals.outputTextTokens,
    outputAudioTokens: totals.outputAudioTokens,
  };
}

/**
 * 把一轮 Realtime 权威用量（`UsageBuckets`）规范化为 D1 `RecordUsageParams`。
 *
 * `mode` 固定为 `realtime`，`estimatedCostUsd` 由调用方传入（Realtime 价格表
 * 与 Chat 价格表不同，避免在此耦合价格计算）。
 */
export function realtimeUsageToRecord(
  usage: UsageBuckets,
  estimatedCostUsd: number,
): RecordUsageParams {
  return {
    mode: "realtime",
    inputTokens: usage.inputTokens,
    inputTextTokens: usage.inputTextTokens,
    inputAudioTokens: usage.inputAudioTokens,
    inputImageTokens: usage.inputImageTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cachedTextTokens: usage.cachedTextTokens,
    cachedAudioTokens: usage.cachedAudioTokens,
    cachedImageTokens: usage.cachedImageTokens,
    outputTokens: usage.outputTokens,
    outputTextTokens: usage.outputTextTokens,
    outputAudioTokens: usage.outputAudioTokens,
    estimatedCostUsd,
  };
}
