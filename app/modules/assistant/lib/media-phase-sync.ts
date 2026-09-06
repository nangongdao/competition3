/**
 * 媒体相位同步的纯决策层。
 *
 * 将 `assistant-workspace` 主组件内联的「媒体授权状态 → 会话相位」同步 effect
 * 抽为可单测纯函数：`resolveMediaPhaseSync` 依据当前媒体授权状态与会话相位，
 * 判定是否需要将相位推进到 `ready`（媒体已授权）或回退到 `idle`（媒体被撤销），
 * 返回判别联合 action，由 hook 侧接线到 reducer。
 *
 * 行为边界（与原内联 effect 保持一致）：
 * - `granted` 且当前为 `idle` → 置 `ready`；
 * - `granted` 且当前已非 `idle` → 无操作（避免重复置位）；
 * - `requesting` → 无操作（授权进行中不干预相位）；
 * - 其余非 `requesting` 且当前非 `idle` → 回退 `idle`。
 */

import type {
  AssistantPhase,
  MediaPermissionStatus,
} from "@/modules/assistant/types";

/** 相位同步应执行的一条动作。 */
export type MediaPhaseSyncAction =
  | { kind: "noop" }
  | { kind: "set-phase"; phase: "ready" | "idle" };

/**
 * 依据媒体授权状态与会话相位，决定是否需要同步相位。
 *
 * @param mediaStatus  当前媒体授权状态
 * @param assistantPhase 当前会话相位
 */
export function resolveMediaPhaseSync(
  mediaStatus: MediaPermissionStatus,
  assistantPhase: AssistantPhase,
): MediaPhaseSyncAction {
  if (mediaStatus === "granted") {
    if (assistantPhase === "idle") {
      return { kind: "set-phase", phase: "ready" };
    }

    return { kind: "noop" };
  }

  // 授权进行中（requesting）不干预相位；其余非 granted 状态在非 idle 时回退。
  if (mediaStatus !== "requesting" && assistantPhase !== "idle") {
    return { kind: "set-phase", phase: "idle" };
  }

  return { kind: "noop" };
}
