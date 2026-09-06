import { useEffect, type Dispatch, type MutableRefObject } from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import {
  buildRestoredTranscriptEntries,
  buildSceneMemoryState,
} from "@/modules/assistant/lib/session-restore";
import type { SceneMemoryState } from "@/modules/assistant/lib/scene-memory";
import type { SessionMessage } from "@/modules/assistant/lib/session-client";
import type { TranscriptSpeaker } from "@/modules/assistant/types";

export type SessionRestoreDeps = {
  /** 首次挂载时加载/创建会话列表（来自 use-sessions）。 */
  initializeSessions: () => Promise<void>;
  /** 首次挂载防重复初始化标记（兼容 StrictMode 双执行）。 */
  hasInitializedRef: MutableRefObject<boolean>;
  /** 会话列表是否已从后端加载完成。 */
  isLoaded: boolean;
  /** 当前选中的会话 id（无则 null，等待选中后再恢复）。 */
  activeSessionId: string | null;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** 追加一条转写条目。 */
  addTranscript: (speaker: TranscriptSpeaker, text: string) => string;
  /** 切换会话并恢复其消息（来自 use-sessions）。返回恢复后的消息。 */
  switchPersistedSession: (sessionId: string) => Promise<SessionMessage[]>;
  /** 恢复当前会话的场景记忆条目（来自 use-sessions）。 */
  restoreSceneMemory: () => Promise<
    | {
        entryId: string;
        summary: string;
        frameTokens?: number | null;
        recordedAt?: number;
      }[]
    | null
  >;
  /** 下一个转写条目 id 序号 ref（恢复后写回递增结果）。 */
  nextEntryIdRef: MutableRefObject<number>;
  /** 场景记忆 ref（恢复后写入）。 */
  sceneMemoryRef: MutableRefObject<SceneMemoryState>;
  /** 防重复恢复标记（跨渲染保证只恢复一次）。 */
  hasRestoredSessionRef: MutableRefObject<boolean>;
};

/**
 * 会话初始化/恢复编排 hook。
 *
 * 收敛 `assistant-workspace` 主组件中「会话列表加载完成后恢复历史消息 +
 * M4.1 场景记忆」的内联 `useEffect`：把两段纯转换委托给
 * `lib/session-restore.ts`，组件仅收集扁平依赖并接线 dispatch / ref 写回。
 * 通过 `hasRestoredSessionRef` 保证只在首次加载完成后恢复一次。
 */
export function useSessionRestore({
  initializeSessions,
  hasInitializedRef,
  isLoaded,
  activeSessionId,
  dispatch,
  addTranscript,
  switchPersistedSession,
  restoreSceneMemory,
  nextEntryIdRef,
  sceneMemoryRef,
  hasRestoredSessionRef,
}: SessionRestoreDeps): void {
  // M3.2 会话持久化：首次挂载时加载/创建会话列表（含恢复逻辑统一收敛于此）。
  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    void initializeSessions();
  }, [initializeSessions, hasInitializedRef]);

  useEffect(() => {
    if (!isLoaded || activeSessionId === null) {
      return;
    }

    if (hasRestoredSessionRef.current) {
      return;
    }

    hasRestoredSessionRef.current = true;

    void switchPersistedSession(activeSessionId).then((messages) => {
      if (messages.length === 0) {
        return;
      }

      const { entries, nextId } = buildRestoredTranscriptEntries(
        messages,
        nextEntryIdRef.current,
      );
      nextEntryIdRef.current = nextId;

      dispatch({ type: "transcript-cleared" });
      for (const entry of entries) {
        dispatch({ type: "transcript-appended", entry });
      }
      addTranscript("system", "已恢复上次会话。");
    });

    // M4.1 场景记忆：跨会话恢复文字摘要。
    void restoreSceneMemory().then((entries) => {
      if (entries === null || entries.length === 0) {
        return;
      }

      sceneMemoryRef.current = buildSceneMemoryState(entries);
    });
  }, [
    initializeSessions,
    hasInitializedRef,
    isLoaded,
    activeSessionId,
    switchPersistedSession,
    restoreSceneMemory,
    addTranscript,
    dispatch,
    nextEntryIdRef,
    sceneMemoryRef,
    hasRestoredSessionRef,
  ]);
}
