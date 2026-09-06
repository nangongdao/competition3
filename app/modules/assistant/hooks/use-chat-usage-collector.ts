import { useCallback, useState } from "react";

import {
  appendChatUsageTurn,
  createEmptyChatUsageReport,
  estimateChatTurnCostFromUsage,
  type ChatTurnEstimateInput,
  type ChatUsageReport,
} from "@/modules/assistant/lib/chat-cost-model";
import type { UsageTotals } from "@/modules/assistant/lib/session-client";

export type UseChatUsageCollectorOptions = {
  /**
   * Optional persistence hook: called after each completed Chat turn with the
   * resolved estimate so the caller can write it into D1 (session-level usage
   * persistence). The Chat mode is implied by this collector. No-op when
   * omitted.
   */
  persistUsage?: (estimate: ChatTurnEstimate) => void;
};

export type UseChatUsageCollectorResult = {
  /** Cumulative Chat-mode usage & cost report. */
  chatUsageReport: ChatUsageReport;
  /** Resets Chat usage accounting for a fresh session. */
  resetChatUsage: () => void;
  /** Records one completed Chat turn and folds its estimate into the report. */
  recordChatTurn: (input: ChatTurnEstimateInput) => void;
  /**
   * Hydrates the in-memory report from D1-persisted totals so a session's
   * historical Chat usage survives page refreshes / session switches.
   */
  seedFromPersistedTotals: (totals: UsageTotals) => void;
};

type ChatTurnEstimate = ReturnType<typeof estimateChatTurnCostFromUsage>;

/**
 * Owns Chat Completions live cost accounting.
 *
 * Chat mode (unlike Realtime) does not surface per-turn token usage from the
 * provider while streaming, so each completed turn is estimated from the
 * inputs the front-end already controls (`estimateChatTurnCost`). Keeps the
 * running `ChatUsageReport` so the workspace can render Chat token usage and
 * estimated cost alongside the Realtime meter.
 */
export function useChatUsageCollector({
  persistUsage,
}: UseChatUsageCollectorOptions = {}): UseChatUsageCollectorResult {
  const [chatUsageReport, setChatUsageReport] = useState<ChatUsageReport>(
    createEmptyChatUsageReport,
  );

  const resetChatUsage = useCallback((): void => {
    setChatUsageReport(createEmptyChatUsageReport());
  }, []);

  const seedFromPersistedTotals = useCallback((totals: UsageTotals): void => {
    setChatUsageReport({
      turnCount: totals.turnCount,
      totals: {
        inputTokens: totals.inputTokens,
        inputTextTokens: totals.inputTextTokens,
        inputImageTokens: totals.inputImageTokens,
        outputTokens: totals.outputTokens,
        outputTextTokens: totals.outputTextTokens,
      },
      lastTurn: null,
      estimatedCostUsd: totals.estimatedCostUsd,
      turns: [],
    });
  }, []);

  const recordChatTurn = useCallback(
    (input: ChatTurnEstimateInput): void => {
      // 非流式请求携带权威 `usage` 时优先采用；否则回退到字符数估算。
      const estimate = estimateChatTurnCostFromUsage(input);
      setChatUsageReport((current) =>
        appendChatUsageTurn(current, estimate, Date.now()),
      );
      persistUsage?.(estimate);
    },
    [persistUsage],
  );

  return {
    chatUsageReport,
    resetChatUsage,
    recordChatTurn,
    seedFromPersistedTotals,
  };
}
