import { mapMessageToTranscriptEntry } from "@/modules/assistant/hooks/use-sessions";
import {
  addSceneSummary,
  createInitialSceneMemoryState,
  type SceneMemoryState,
} from "@/modules/assistant/lib/scene-memory";
import { estimateImageTokens } from "@/modules/assistant/lib/cost-model";
import { MAX_FRAME_WIDTH } from "@/modules/assistant/lib/frame-processing";
import type { SessionMessage } from "@/modules/assistant/lib/session-client";
import type { SceneMemoryEntry } from "@/modules/assistant/lib/session-client";
import type { TranscriptEntry } from "@/modules/assistant/types";

/**
 * 会话初始化/恢复编排纯函数。
 *
 * 收敛 `assistant-workspace` 主组件中「恢复历史消息 + 恢复 M4.1 场景记忆」
 * 的内联 `useEffect`：把"持久化消息 → 转写条目"与"场景记忆条目 → 状态"
 * 两段纯转换抽离出来，组件仅收集依赖并接线副作用。
 */

export type RestoredTranscriptResult = {
  /** 由持久化消息转换的转写条目。 */
  entries: TranscriptEntry[];
  /** 递增后的下一个转写条目 id 序号。 */
  nextId: number;
};

/**
 * 将持久化消息映射为转写区条目，id 从 `nextId` 起递增。
 *
 * 纯函数：不修改外部状态，返回 `{ entries, nextId }`，由调用方把 `nextId`
 * 写回其 id ref，避免副作用藏在转换函数里。
 */
export function buildRestoredTranscriptEntries(
  messages: readonly SessionMessage[],
  nextId: number,
): RestoredTranscriptResult {
  let idCursor = nextId;
  const entries: TranscriptEntry[] = messages.map((message) => {
    const id = `entry-${idCursor}`;
    idCursor += 1;
    return mapMessageToTranscriptEntry(message, id);
  });

  return { entries, nextId: idCursor };
}

/**
 * 由持久化的场景记忆条目构建 `SceneMemoryState`。
 *
 * 缺省 `recordedAt` 用当前时间兜底；缺省 `frameTokens` 用视频帧估算 token
 * 兜底（与 M4.1 采样的默认帧尺寸一致），保证成本对比不因历史条目缺失字段
 * 而失真。
 */
export function buildSceneMemoryState(
  entries: readonly SceneMemoryEntry[],
): SceneMemoryState {
  let nextState = createInitialSceneMemoryState();

  for (const entry of entries) {
    nextState = addSceneSummary(nextState, {
      id: entry.entryId,
      text: entry.summary,
      recordedAt: entry.recordedAt ?? Date.now(),
      frameTokens:
        entry.frameTokens ??
        estimateImageTokens(
          MAX_FRAME_WIDTH,
          Math.round(MAX_FRAME_WIDTH * (9 / 16)),
        ),
    });
  }

  return nextState;
}
