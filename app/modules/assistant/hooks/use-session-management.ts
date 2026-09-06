import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { mapMessageToTranscriptEntry } from "@/modules/assistant/hooks/use-sessions";
import type { SessionMessage, SceneMemoryEntry } from "@/modules/assistant/lib/session-client";
import type { SceneMemoryState } from "@/modules/assistant/lib/scene-memory";
import { clearSceneMemory } from "@/modules/assistant/lib/scene-memory";
import { buildSceneMemoryFromEntries } from "@/modules/assistant/lib/scene-memory-rebuild";
import { estimateImageTokens } from "@/modules/assistant/lib/cost-model";
import { MAX_FRAME_WIDTH } from "@/modules/assistant/lib/frame-processing";
import type { SpatialAnnotation } from "@/modules/assistant/lib/spatial-annotation";
import type { FrameSignature } from "@/modules/assistant/lib/frame-diff";
import type { TranscriptEntry, TranscriptSpeaker } from "@/modules/assistant/types";
import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";

type RetryableChatTurns = Readonly<Record<string, RetryableChatTurn>>;

type RetryableChatTurn = {
  message: string;
  imageDataUrl?: string;
  signature?: FrameSignature;
};

type SessionExportFormat = "json" | "md";

export type UseSessionManagementOptions = {
  dispatch: Dispatch<AssistantAction>;
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: TranscriptEntry["deliveryStatus"],
  ) => string;
  cancelChatSpeech: () => void;
  sceneMemoryRef: MutableRefObject<SceneMemoryState>;
  nextEntryIdRef: MutableRefObject<number>;
  setRetryableChatTurns: Dispatch<SetStateAction<RetryableChatTurns>>;
  setSpatialAnnotations: Dispatch<SetStateAction<readonly SpatialAnnotation[]>>;
  /** 当前会话 id（来自 useSessions 的 sessionState.activeSessionId）。 */
  activeSessionId: string | null;
  /** useSessions.newSession */
  newPersistedSession: () => Promise<string | null>;
  /** useSessions.switchSession */
  switchPersistedSession: (sessionId: string) => Promise<SessionMessage[]>;
  /** useSessions.rename */
  renamePersistedSession: (sessionId: string, title: string) => Promise<boolean>;
  /** useSessions.remove */
  removePersistedSession: (sessionId: string) => Promise<boolean>;
  /** useSessions.exportSession */
  exportPersistedSession: (sessionId: string, format: SessionExportFormat) => Promise<boolean>;
  /** useSessions.pruneEmptySessions */
  pruneEmptySessions: (keepActive?: boolean) => Promise<number>;
  /** useSessions.restoreSceneMemory */
  restoreSceneMemory: () => Promise<SceneMemoryEntry[] | null>;
};

export type UseSessionManagementResult = {
  isPruningEmptySessions: boolean;
  handleNewSession: () => void;
  handleSessionSwitch: (sessionId: string) => void;
  handleSessionRename: (sessionId: string, title: string) => void;
  handleSessionRemove: (sessionId: string) => void;
  handleSessionExport: (sessionId: string, format: SessionExportFormat) => void;
  handlePruneEmptySessions: () => Promise<void>;
};

/**
 * 多会话编排层（M3.3 + M4.1 收敛）。
 *
 * 把 main 组件里散落的会话 handlers（新建/切换/重命名/删除/导出/清理空会话）
 * 与配套的转写区重置、场景记忆恢复等编排逻辑收敛到单一 hook，
 * 保持 `assistant-workspace.tsx` 只做接线。内部状态 `isPruningEmptySessions`
 * 仅在清理空会话期间短暂为 true，用于禁用重复点击。
 */
export function useSessionManagement(options: UseSessionManagementOptions): UseSessionManagementResult {
  const {
    dispatch,
    addTranscript,
    cancelChatSpeech,
    sceneMemoryRef,
    nextEntryIdRef,
    setRetryableChatTurns,
    setSpatialAnnotations,
    activeSessionId,
    newPersistedSession,
    switchPersistedSession,
    renamePersistedSession,
    removePersistedSession,
    exportPersistedSession,
    pruneEmptySessions,
    restoreSceneMemory,
  } = options;

  const [isPruningEmptySessions, setIsPruningEmptySessions] = useState(false);

  const resetWorkspace = useCallback((): void => {
    cancelChatSpeech();
    dispatch({ type: "transcript-cleared" });
    setRetryableChatTurns({});
    setSpatialAnnotations([]);
    nextEntryIdRef.current = 0;
  }, [cancelChatSpeech, dispatch, nextEntryIdRef, setRetryableChatTurns, setSpatialAnnotations]);

  const restoreSceneMemoryInto = useCallback(
    (clearWhenEmpty: boolean): void => {
      const fallbackFrameTokens = estimateImageTokens(
        MAX_FRAME_WIDTH,
        Math.round(MAX_FRAME_WIDTH * (9 / 16)),
      );
      void restoreSceneMemory().then((entries) => {
        const rebuilt = buildSceneMemoryFromEntries(entries, fallbackFrameTokens);
        if (rebuilt === null) {
          if (clearWhenEmpty) {
            sceneMemoryRef.current = clearSceneMemory();
          }
          return;
        }
        sceneMemoryRef.current = rebuilt;
      });
    },
    [restoreSceneMemory, sceneMemoryRef],
  );

  // M3.3 多会话管理：新建会话并清空转写区。
  const handleNewSession = useCallback((): void => {
    resetWorkspace();
    // M4.1：新会话清空内存场景记忆。
    sceneMemoryRef.current = clearSceneMemory();
    void newPersistedSession();
  }, [newPersistedSession, resetWorkspace, sceneMemoryRef]);

  // M3.3 多会话管理：切换会话并恢复其历史到转写区。
  const handleSessionSwitch = useCallback(
    (sessionId: string): void => {
      cancelChatSpeech();
      setSpatialAnnotations([]);
      void switchPersistedSession(sessionId).then((messages) => {
        dispatch({ type: "transcript-cleared" });
        setRetryableChatTurns({});
        nextEntryIdRef.current = 0;
        const restoredEntries: TranscriptEntry[] = messages.map((message) => {
          const id = `entry-${nextEntryIdRef.current}`;
          nextEntryIdRef.current += 1;
          return mapMessageToTranscriptEntry(message, id);
        });
        for (const entry of restoredEntries) {
          dispatch({ type: "transcript-appended", entry });
        }
        addTranscript("system", "已切换会话。");
      });
      // M4.1：切换会话后从后端恢复该会话的场景记忆（空则清空）。
      restoreSceneMemoryInto(true);
    },
    [
      addTranscript,
      cancelChatSpeech,
      dispatch,
      nextEntryIdRef,
      restoreSceneMemoryInto,
      setRetryableChatTurns,
      setSpatialAnnotations,
      switchPersistedSession,
    ],
  );

  // M3.3 多会话管理：重命名会话。
  const handleSessionRename = useCallback(
    (sessionId: string, title: string): void => {
      void renamePersistedSession(sessionId, title);
    },
    [renamePersistedSession],
  );

  // M3.3 多会话管理：删除会话，若删除的是当前会话则清空转写区。
  const handleSessionRemove = useCallback(
    (sessionId: string): void => {
      void removePersistedSession(sessionId).then((removed) => {
        if (removed && sessionId === activeSessionId) {
          resetWorkspace();
          addTranscript("system", "会话已删除。");
        }
      });
    },
    [activeSessionId, addTranscript, removePersistedSession, resetWorkspace],
  );

  // M3.3 多会话管理：导出会话为 JSON / Markdown。
  const handleSessionExport = useCallback(
    (sessionId: string, format: SessionExportFormat): void => {
      void exportPersistedSession(sessionId, format);
    },
    [exportPersistedSession],
  );

  // M3.3 多会话管理：清理空会话（保留当前会话）。
  const handlePruneEmptySessions = useCallback(async (): Promise<void> => {
    if (isPruningEmptySessions) {
      return;
    }

    setIsPruningEmptySessions(true);
    const removed = await pruneEmptySessions(true);
    setIsPruningEmptySessions(false);

    if (removed > 0) {
      addTranscript("system", `已清理 ${removed} 个空会话。`);
    }
  }, [addTranscript, isPruningEmptySessions, pruneEmptySessions]);

  return {
    isPruningEmptySessions,
    handleNewSession,
    handleSessionSwitch,
    handleSessionRename,
    handleSessionRemove,
    handleSessionExport,
    handlePruneEmptySessions,
  };
}
