import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * M4.1 场景记忆 UI 展示统计：摘要条目数 + 预估节省 token。
 */
export type SceneMemoryStats = {
  count: number;
  savingsTokens: number;
};

/**
 * M4.2 多模态融合 UI 展示统计：融合次数 + 节省往返调用数 + 图像 token。
 */
export type FusionStats = {
  count: number;
  savedCalls: number;
  imageTokens: number;
};

/**
 * 文本历史摘要 UI 展示统计：压缩轮次条数 + 预估节省文本 token。
 */
export type TextHistoryStats = {
  summarizedEntryCount: number;
  savedTextTokens: number;
};

export type AssistantStatsResult = {
  sceneMemoryStats: SceneMemoryStats;
  setSceneMemoryStats: Dispatch<SetStateAction<SceneMemoryStats>>;
  fusionStats: FusionStats;
  setFusionStats: Dispatch<SetStateAction<FusionStats>>;
  textHistoryStats: TextHistoryStats;
  setTextHistoryStats: Dispatch<SetStateAction<TextHistoryStats>>;
};

const INITIAL_SCENE_MEMORY_STATS: SceneMemoryStats = {
  count: 0,
  savingsTokens: 0,
};

const INITIAL_FUSION_STATS: FusionStats = {
  count: 0,
  savedCalls: 0,
  imageTokens: 0,
};

const INITIAL_TEXT_HISTORY_STATS: TextHistoryStats = {
  summarizedEntryCount: 0,
  savedTextTokens: 0,
};

/**
 * 会话领域 UI 统计状态聚合 hook。
 *
 * 收敛 `assistant-workspace` 主组件中多段内联 UI 统计 state：
 * - `sceneMemoryStats`（M4.1 场景记忆展示统计）
 * - `fusionStats`（M4.2 多模态融合展示统计）
 * - `textHistoryStats`（文本历史摘要展示统计）
 *
 * 各段状态默认值内聚为模块级常量，对外暴露统一的状态/更新接口，
 * 由主组件传递给 `useSendChatTurn` / `useContinuousChatVoice` 写入、`VisionColumn` 展示。
 */
export function useAssistantStats(): AssistantStatsResult {
  const [sceneMemoryStats, setSceneMemoryStats] = useState<SceneMemoryStats>(
    INITIAL_SCENE_MEMORY_STATS,
  );
  const [fusionStats, setFusionStats] = useState<FusionStats>(
    INITIAL_FUSION_STATS,
  );
  const [textHistoryStats, setTextHistoryStats] = useState<TextHistoryStats>(
    INITIAL_TEXT_HISTORY_STATS,
  );

  return {
    sceneMemoryStats,
    setSceneMemoryStats,
    fusionStats,
    setFusionStats,
    textHistoryStats,
    setTextHistoryStats,
  };
}
