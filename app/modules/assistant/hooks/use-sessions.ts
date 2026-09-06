import { useCallback, useState } from "react";

import {
  appendSessionMessage,
  createSession,
  deleteSession,
  getGlobalUsageTotals,
  getSessionSceneMemory,
  getSessionWithMessages,
  getSessionUsage,
  listSessions,
  recordSessionUsage,
  renameSession,
  replaceSessionSceneMemory,
  type AppendMessageParams,
  type RecordUsageParams,
  type SceneMemoryEntry,
  type SessionMessage,
  type SessionSummary,
  type SessionUsage,
  type UsageTotals,
} from "@/modules/assistant/lib/session-client";
import { downloadTextFile } from "@/modules/assistant/lib/download";
import {
  createSessionExportFilename,
  serializeSessionJson,
  serializeSessionMarkdown,
  type SessionExportFormat,
} from "@/modules/assistant/lib/session-export";

type SessionPersistenceState = {
  /** 会话列表（按 updated_at desc）。 */
  sessions: SessionSummary[];
  /** 当前选中的会话 id（无则 null）。 */
  activeSessionId: string | null;
  /** 是否已从后端完成首次会话列表加载。 */
  isLoaded: boolean;
  /** 首次加载/恢复过程中是否有错误。 */
  errorMessage?: string;
};

/**
 * 把持久化消息映射为转写区条目（纯函数，便于单测）。
 *
 * system 角色映射为 user（当前会话模型不含 system 转写），
 * 其余按角色映射，已完成消息统一标记为 sent。
 */
export function mapMessageToTranscriptEntry(
  message: SessionMessage,
  id: string,
): {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  createdAt: number;
  deliveryStatus: "sent";
} {
  const speaker = message.role === "user" ? "user" : "assistant";

  return {
    id,
    speaker,
    text: message.content,
    createdAt: message.createdAt,
    deliveryStatus: "sent",
  };
}

type UseSessionsResult = {
  sessionState: SessionPersistenceState;
  /** 首次加载最近会话并恢复其消息；无会话时自动创建一个。 */
  initialize: () => Promise<void>;
  /** 新建一个会话并设为当前。返回新会话 id。 */
  newSession: () => Promise<string | null>;
  /** 切换到指定会话并恢复其消息。返回恢复后的消息。 */
  switchSession: (sessionId: string) => Promise<SessionMessage[]>;
  /** 当前会话追加一条消息。返回持久化后的消息。 */
  persistMessage: (params: AppendMessageParams) => Promise<SessionMessage | null>;
  /** 重命名会话。 */
  rename: (sessionId: string, title: string) => Promise<boolean>;
  /** 删除会话。删除的是当前会话时自动切到剩余最近会话。 */
  remove: (sessionId: string) => Promise<boolean>;
  /** 导出会话为 JSON 或 Markdown，并触发下载。返回是否成功。 */
  exportSession: (sessionId: string, format: SessionExportFormat) => Promise<boolean>;
  /** 清理无消息的空会话（可选过滤保留当前会话）。 */
  pruneEmptySessions: (keepActive?: boolean) => Promise<number>;
  /** M4.1：读取当前会话的场景记忆条目；无会话或失败返回 null。 */
  restoreSceneMemory: () => Promise<SceneMemoryEntry[] | null>;
  /** M4.1：把当前会话的场景记忆覆盖持久化到后端。返回保存条数或 -1。 */
  persistSceneMemory: (entries: readonly SceneMemoryEntry[]) => Promise<number>;
  /** 会话级用量持久化：读取当前会话的用量记录与累计汇总；无会话或失败返回 null。 */
  restoreUsage: () => Promise<SessionUsage | null>;
  /** 会话级用量持久化：把一轮用量写入当前会话；无会话或失败返回 null。 */
  persistUsage: (params: RecordUsageParams) => Promise<SessionUsage["entries"][number] | null>;
  /** ② 全局累计用量：读取跨会话累计汇总；失败返回 null。 */
  loadGlobalUsageTotals: () => Promise<UsageTotals | null>;
};

/**
 * 会话持久化 hook（M3.2）。
 *
 * 负责与 `/api/sessions/*` 通信，管理会话列表与当前会话，并在
 * 切换会话 / 刷新恢复时返回该会话的历史消息供上层注入 transcript。
 * 不直接持有 transcript，仅做数据源与协调。
 */
export function useSessions(): UseSessionsResult {
  const [sessionState, setSessionState] = useState<SessionPersistenceState>({
    sessions: [],
    activeSessionId: null,
    isLoaded: false,
  });

  const initialize = useCallback(async (): Promise<void> => {
    const sessions = await listSessions(50, 0);

    if (sessions.length === 0) {
      const created = await createSession({});
      const nextSessions = created === null ? [] : [created];
      setSessionState({
        sessions: nextSessions,
        activeSessionId: created?.id ?? null,
        isLoaded: true,
      });
      return;
    }

    // 默认恢复最近一个会话
    const latest = sessions[0];
    setSessionState({
      sessions,
      activeSessionId: latest?.id ?? null,
      isLoaded: true,
    });
  }, []);

  const newSession = useCallback(async (): Promise<string | null> => {
    const created = await createSession({});

    if (created === null) {
      return null;
    }

    setSessionState((current) => ({
      ...current,
      sessions: [created, ...current.sessions],
      activeSessionId: created.id,
    }));
    return created.id;
  }, []);

  const switchSession = useCallback(
    async (sessionId: string): Promise<SessionMessage[]> => {
      const detail = await getSessionWithMessages(sessionId);

      if (detail === null) {
        return [];
      }

      setSessionState((current) => ({
        ...current,
        activeSessionId: sessionId,
      }));
      return detail.messages;
    },
    [],
  );

  const persistMessage = useCallback(
    async (params: AppendMessageParams): Promise<SessionMessage | null> => {
      const sessionId = sessionState.activeSessionId;

      if (sessionId === null) {
        return null;
      }

      const message = await appendSessionMessage(sessionId, params);

      if (message === null) {
        return null;
      }

      // 追加消息会更新会话 updated_at，将其提到列表最前
      setSessionState((current) => {
        const target = current.sessions.find((s) => s.id === sessionId);

        if (target === undefined) {
          return current;
        }

        const updated: SessionSummary = {
          ...target,
          updatedAt: message.createdAt,
          messageCount: target.messageCount + 1,
        };

        return {
          ...current,
          sessions: [updated, ...current.sessions.filter((s) => s.id !== sessionId)],
        };
      });
      return message;
    },
    [sessionState.activeSessionId],
  );

  const rename = useCallback(
    async (sessionId: string, title: string): Promise<boolean> => {
      const ok = await renameSession(sessionId, title);

      if (!ok) {
        return false;
      }

      setSessionState((current) => ({
        ...current,
        sessions: current.sessions.map((s) =>
          s.id === sessionId ? { ...s, title } : s,
        ),
      }));
      return true;
    },
    [],
  );

  const remove = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const ok = await deleteSession(sessionId);

      if (!ok) {
        return false;
      }

      setSessionState((current) => {
        const remaining = current.sessions.filter((s) => s.id !== sessionId);
        const wasActive = current.activeSessionId === sessionId;

        return {
          ...current,
          sessions: remaining,
          activeSessionId: wasActive ? (remaining[0]?.id ?? null) : current.activeSessionId,
        };
      });
      return true;
    },
    [],
  );


  const exportSession = useCallback(
    async (sessionId: string, format: SessionExportFormat): Promise<boolean> => {
      const detail = await getSessionWithMessages(sessionId);

      if (detail === null) {
        return false;
      }

      const exportedAt = Date.now();
      const content =
        format === "md"
          ? serializeSessionMarkdown(detail.id, detail.title, detail.messages, exportedAt)
          : serializeSessionJson(detail.id, detail.title, detail.messages, exportedAt);
      const filename = createSessionExportFilename(exportedAt, format);

      downloadTextFile(content, format === "md" ? "text/markdown" : "application/json", filename);
      return true;
    },
    [],
  );

  const pruneEmptySessions = useCallback(
    async (keepActive = true): Promise<number> => {
      const empty = sessionState.sessions.filter(
        (s) =>
          s.messageCount === 0 && (!keepActive || s.id !== sessionState.activeSessionId),
      );

      let removed = 0;

      for (const target of empty) {
        const ok = await deleteSession(target.id);

        if (ok) {
          removed += 1;
        }
      }

      if (removed > 0) {
        setSessionState((current) => ({
          ...current,
          sessions: current.sessions.filter(
            (s) => !(s.messageCount === 0 && (!keepActive || s.id !== current.activeSessionId)),
          ),
        }));
      }

      return removed;
    },
    [sessionState.sessions, sessionState.activeSessionId],
  );

  /** M4.1：读取当前会话的场景记忆条目；无会话或失败返回 null。 */
  const restoreSceneMemory = useCallback(async (): Promise<SceneMemoryEntry[] | null> => {
    const sessionId = sessionState.activeSessionId;

    if (sessionId === null) {
      return null;
    }

    return getSessionSceneMemory(sessionId);
  }, [sessionState.activeSessionId]);

  /** M4.1：把当前会话的场景记忆覆盖持久化到后端。返回保存条数或 -1。 */
  const persistSceneMemory = useCallback(
    async (entries: readonly SceneMemoryEntry[]): Promise<number> => {
      const sessionId = sessionState.activeSessionId;

      if (sessionId === null) {
        return -1;
      }

      return replaceSessionSceneMemory(sessionId, entries);
    },
    [sessionState.activeSessionId],
  );

  /** 会话级用量持久化：读取当前会话的用量记录与累计汇总。 */
  const restoreUsage = useCallback(async (): Promise<SessionUsage | null> => {
    const sessionId = sessionState.activeSessionId;

    if (sessionId === null) {
      return null;
    }

    return getSessionUsage(sessionId);
  }, [sessionState.activeSessionId]);

  /** 会话级用量持久化：把一轮用量写入当前会话。 */
  const persistUsage = useCallback(
    async (params: RecordUsageParams): Promise<SessionUsage["entries"][number] | null> => {
      const sessionId = sessionState.activeSessionId;

      if (sessionId === null) {
        return null;
      }

      return recordSessionUsage(sessionId, params);
    },
    [sessionState.activeSessionId],
  );

  /** ② 全局累计用量：读取跨会话累计汇总。 */
  const loadGlobalUsageTotals = useCallback(async (): Promise<UsageTotals | null> => {
    return getGlobalUsageTotals();
  }, []);

  return {
    sessionState,
    initialize,
    newSession,
    switchSession,
    persistMessage,
    rename,
    remove,
    exportSession,
    pruneEmptySessions,
    restoreSceneMemory,
    persistSceneMemory,
    restoreUsage,
    persistUsage,
    loadGlobalUsageTotals,
  };
}
