/**
 * 媒体相位同步 hook。
 *
 * 收敛 `assistant-workspace` 主组件中内联的「媒体授权状态 → 会话相位」同步 effect：
 * 把扁平依赖交给纯函数 `resolveMediaPhaseSync` 判定是否需要切换相位，仅在有变更时
 * dispatch `phase-set` 到 reducer。核心判定逻辑沉淀在 `lib/media-phase-sync.ts`，
 * 由纯函数单测覆盖，本 hook 仅保留薄接线。
 */

import { useEffect } from "react";

import type {
  AssistantPhase,
  MediaPermissionState,
} from "@/modules/assistant/types";

import { resolveMediaPhaseSync } from "@/modules/assistant/lib/media-phase-sync";

type MediaPhaseSyncInput = {
  mediaState: MediaPermissionState;
  assistantPhase: AssistantPhase;
  dispatch: (action: { type: "phase-set"; phase: AssistantPhase }) => void;
};

/** 依据媒体授权状态与当前相位，自动同步会话相位。 */
export function useMediaPhaseSync({
  mediaState,
  assistantPhase,
  dispatch,
}: MediaPhaseSyncInput): void {
  useEffect(() => {
    const action = resolveMediaPhaseSync(
      mediaState.status,
      assistantPhase,
    );

    if (action.kind === "set-phase") {
      dispatch({ type: "phase-set", phase: action.phase });
    }
  }, [assistantPhase, dispatch, mediaState.status]);
}
