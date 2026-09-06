import type { AssistantPhase } from "@/modules/assistant/types";
import type { AssistantSessionMode } from "@/modules/assistant/lib/assistant-session";

/**
 * 工作区动作编排纯函数。
 *
 * 收敛 `assistant-workspace` 主组件中剩余的会话停止 / Provider 模式切换
 * 内联编排：把"决策"（该做什么）与"副作用"（怎么做）解耦，组件仅收集
 * 扁平依赖快照并委托纯函数接线副作用。
 */

export type StopSessionAction =
  /** 会话曾激活或存在 Realtime 连接 → 记录"已停止"提示。 */
  | { kind: "log-stopped" }
  /** 复位会话阶段到待机（媒体已授权则 ready，否则 idle）。 */
  | { kind: "phase-set"; phase: AssistantPhase };

export type StopSessionInput = {
  /** 是否存在激活中的会话阶段。 */
  hasActiveSession: boolean;
  /** 是否存在 Realtime 连接。 */
  hasRealtimeConnection: boolean;
  /** 摄像头 / 麦克风是否已授权。 */
  mediaGranted: boolean;
};

/**
 * 将会话停止的副作用展开为有序判别联合 action 数组。
 *
 * - 仅当会话确实激活过或存在 Realtime 连接时才输出 `log-stopped`（避免空会话
 *   也追加无意义提示）。
 * - 始终复位阶段：媒体已授权 → `ready`（待机可启动），否则 → `idle`。
 */
export function resolveStopSessionActions({
  hasActiveSession,
  hasRealtimeConnection,
  mediaGranted,
}: StopSessionInput): StopSessionAction[] {
  const actions: StopSessionAction[] = [];

  if (hasActiveSession || hasRealtimeConnection) {
    actions.push({ kind: "log-stopped" });
  }

  actions.push({ kind: "phase-set", phase: mediaGranted ? "ready" : "idle" });

  return actions;
}

export type ProviderModeChangeAction =
  | { kind: "set-mode"; next: AssistantSessionMode }
  | { kind: "noop" };

/**
 * 将 Provider 模式切换事件值解析为判别联合 action。
 *
 * 仅接受合法的 `chat` / `realtime` 枚举值（对应单选输入），非法值视为 noop，
 * 与当前模式相同亦视为 noop（后续由 `changeProviderMode` 内部去重）。
 */
export function resolveProviderModeChange(
  value: string,
  previous: AssistantSessionMode,
): ProviderModeChangeAction {
  if (value !== "chat" && value !== "realtime") {
    return { kind: "noop" };
  }

  if (value === previous) {
    return { kind: "noop" };
  }

  return { kind: "set-mode", next: value };
}
