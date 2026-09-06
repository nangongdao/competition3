import { useCallback, useRef, useState } from "react";

import {
  appendUsageTurn,
  createEmptyUsageReport,
  parseResponseUsage,
  type UsageBuckets,
  type UsageReport,
} from "@/modules/assistant/lib/cost-model";
import { usageTotalsToBuckets } from "@/modules/assistant/lib/usage-persistence";
import type { UsageTotals } from "@/modules/assistant/lib/session-client";
import {
  beginResponse,
  buildFramePruneEvent,
  completeResponse,
  createFramePruneTracker,
  getCreatedImageItemId,
  trackCreatedFrame,
  type FramePruneTracker,
} from "@/modules/assistant/lib/frame-pruning";

export type UseRealtimeUsageCollectorOptions = {
  /** When true, consumed image frames are deleted from server history. */
  pruneConsumedFrames: boolean;
  /** Provides the live data channel used to emit frame-prune events. */
  getDataChannel: () => RTCDataChannel | null;
  /**
   * Optional persistence hook: called after each authoritative `response.done`
   * usage so the caller can write it into D1 (session-level usage persistence).
   * The Realtime mode is implied by this collector. No-op when omitted.
   */
  persistUsage?: (usage: UsageBuckets) => void;
};

export type RealtimeUsageCollectorResult = {
  usageReport: UsageReport;
  prunedFrameCount: number;
  /** Resets usage & prune accounting for a fresh session. */
  reset: () => void;
  /** Records a response.done event and folds its usage into the report. */
  recordResponseDone: (event: Record<string, unknown>) => void;
  /**
   * Hydrates the in-memory report from D1-persisted totals so a session's
   * historical Realtime usage survives page refreshes / session switches.
   */
  seedFromPersistedTotals: (totals: UsageTotals) => void;
  /** Tracks a newly created image item so it can be pruned later. */
  recordImageCreated: (event: Record<string, unknown>) => void;
  /** Marks the start of a server response (resets the prune window). */
  beginResponse: () => void;
  /** Deletes consumed image frames from the server history via the channel. */
  pruneConsumedFrames: () => void;
};

/**
 * Owns Realtime usage accounting and conversation-history frame pruning.
 *
 * Centralizes the `usageReport`, `prunedFrameCount`, and prune tracker state so
 * the session orchestration hook only wires them into the server-event flow.
 */
export function useRealtimeUsageCollector({
  pruneConsumedFrames,
  getDataChannel,
  persistUsage,
}: UseRealtimeUsageCollectorOptions): RealtimeUsageCollectorResult {
  const [usageReport, setUsageReport] = useState<UsageReport>(
    createEmptyUsageReport,
  );
  const persistUsageRef = useRef(persistUsage);
  persistUsageRef.current = persistUsage;
  const [prunedFrameCount, setPrunedFrameCount] = useState(0);
  const pruneTrackerRef = useRef<FramePruneTracker>(createFramePruneTracker());
  const pruneSequenceRef = useRef(0);
  const pruneConsumedFramesRef = useRef(pruneConsumedFrames);
  pruneConsumedFramesRef.current = pruneConsumedFrames;

  const reset = useCallback((): void => {
    setUsageReport(createEmptyUsageReport());
    setPrunedFrameCount(0);
    pruneTrackerRef.current = createFramePruneTracker();
    pruneSequenceRef.current = 0;
  }, []);

  const seedFromPersistedTotals = useCallback((totals: UsageTotals): void => {
    setUsageReport({
      turnCount: totals.turnCount,
      totals: usageTotalsToBuckets(totals),
      lastTurn: null,
      estimatedCostUsd: totals.estimatedCostUsd,
      turns: [],
    });
  }, []);

  const recordResponseDone = useCallback(
    (event: Record<string, unknown>): void => {
      const turnUsage = parseResponseUsage(event);

      if (turnUsage === null) {
        return;
      }

      setUsageReport((current) => {
        return appendUsageTurn(current, turnUsage, Date.now());
      });
      // 会话级用量持久化：把权威用量委托给调用方写入 D1。
      persistUsageRef.current?.(turnUsage);
    },
    [],
  );

  const recordImageCreated = useCallback(
    (event: Record<string, unknown>): void => {
      const imageItemId = getCreatedImageItemId(event);

      if (imageItemId !== null) {
        pruneTrackerRef.current = trackCreatedFrame(
          pruneTrackerRef.current,
          imageItemId,
        );
      }
    },
    [],
  );

  const beginResponseCb = useCallback((): void => {
    pruneTrackerRef.current = beginResponse(pruneTrackerRef.current);
  }, []);

  const pruneConsumedFramesCb = useCallback((): void => {
    const { tracker, consumedItemIds } = completeResponse(
      pruneTrackerRef.current,
    );
    pruneTrackerRef.current = tracker;

    if (consumedItemIds.length === 0 || !pruneConsumedFramesRef.current) {
      return;
    }

    const dataChannel = getDataChannel();

    if (dataChannel === null || dataChannel.readyState !== "open") {
      return;
    }

    consumedItemIds.forEach((itemId) => {
      pruneSequenceRef.current += 1;
      dataChannel.send(
        JSON.stringify(buildFramePruneEvent(itemId, pruneSequenceRef.current)),
      );
    });
    setPrunedFrameCount((current) => current + consumedItemIds.length);
  }, [getDataChannel]);

  return {
    usageReport,
    prunedFrameCount,
    reset,
    recordResponseDone,
    seedFromPersistedTotals,
    recordImageCreated,
    beginResponse: beginResponseCb,
    pruneConsumedFrames: pruneConsumedFramesCb,
  };
}
