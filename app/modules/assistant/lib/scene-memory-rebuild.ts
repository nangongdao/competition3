import type { SceneMemoryEntry } from "@/modules/assistant/lib/session-client";
import {
  addSceneSummary,
  createInitialSceneMemoryState,
  type SceneMemoryState,
} from "@/modules/assistant/lib/scene-memory";

/**
 * 把后端持久化的场景记忆条目重建为内存态 `SceneMemoryState`（纯函数）。
 *
 * - 条目为空或后端返回 null 时返回 `null`，表示"调用方应清空内存场景记忆"。
 * - 条目非空时逐条 `addSceneSummary` 合并为不可变快照。
 *
 * `fallbackFrameTokens` 用于条目未携带帧 token 时的兜底估算值。
 */
export function buildSceneMemoryFromEntries(
  entries: readonly SceneMemoryEntry[] | null,
  fallbackFrameTokens: number,
): SceneMemoryState | null {
  if (entries === null || entries.length === 0) {
    return null;
  }

  let nextState = createInitialSceneMemoryState();
  for (const entry of entries) {
    nextState = addSceneSummary(nextState, {
      id: entry.entryId,
      text: entry.summary,
      recordedAt: entry.recordedAt ?? Date.now(),
      frameTokens: entry.frameTokens ?? fallbackFrameTokens,
    });
  }

  return nextState;
}
