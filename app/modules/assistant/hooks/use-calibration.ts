import { useCallback, useEffect, useState } from "react";

import {
  buildCalibrationSample,
  buildCalibrationViewModel,
  parseStoredCalibrationSamples,
  serializeCalibrationSamples,
  type CalibrationViewModel,
} from "@/modules/assistant/lib/calibration-store";

/** localStorage 中成本校准样本的存储键。 */
export const CALIBRATION_STORAGE_KEY = "assistant.calibration-samples";

export type UseCalibrationOptions = {
  /**
   * 会话列表是否已从后端加载完成（决定何时初始化 localStorage 样本）。
   * 仅为与既有 hook 语义对齐；本 hook 主要靠惰性初始化读取存储。
   */
  isLoaded: boolean;
  /** 当前会话 id（无则 null）；作为校准样本的 label。 */
  activeSessionId: string | null;
  /** 当前会话前端估算成本（USD）；记录样本时作为估算侧。 */
  currentEstimateUsd: number;
};

export type UseCalibrationResult = {
  /** 校准视图模型；无样本时为空模型（samples/deltas 为空、汇总全零）。 */
  viewModel: CalibrationViewModel;
  /** 记录一条校准样本（以当前估算成本 + 当前会话 label）。 */
  addCalibration: (measuredUsd: number) => void;
  /** 删除指定下标的样本。 */
  removeCalibration: (index: number) => void;
  /** 清空全部样本。 */
  clearCalibrations: () => void;
};

/**
 * 成本校准工作台状态 hook。
 *
 * 收敛「成本校准面板」状态：
 *   - 惰性初始化从 localStorage 读取已持久化的校准样本（`parseStoredCalibrationSamples`，
 *     容错解析，非法数据返回空数组）；
 *   - `addCalibration` 以当前估算成本 + 当前会话 label 构造样本，
 *     `buildCalibrationViewModel` 折叠视图并持久化到 localStorage；
 *   - `removeCalibration` / `clearCalibrations` 就地更新并持久化。
 *
 * 存储副作用（localStorage）封装在本 hook 内；纯决策委托给
 * `lib/calibration-store.ts` 的纯函数。
 */
export function useCalibration({
  isLoaded,
  activeSessionId,
  currentEstimateUsd,
}: UseCalibrationOptions): UseCalibrationResult {
  const [samples, setSamples] = useState<readonly ReturnType<
    typeof buildCalibrationSample
  >[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      return parseStoredCalibrationSamples(
        window.localStorage.getItem(CALIBRATION_STORAGE_KEY),
      );
    } catch {
      return [];
    }
  });

  // 持久化样本到 localStorage（仅在样本变化时写入）。
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      if (samples.length === 0) {
        window.localStorage.removeItem(CALIBRATION_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          CALIBRATION_STORAGE_KEY,
          serializeCalibrationSamples(samples),
        );
      }
    } catch {
      // localStorage 不可用（隐私模式等）时忽略，仅内存态生效。
    }
  }, [samples]);

  // isLoaded 翻转（会话加载完成后）时重新从存储读取，保持跨会话一致性。
  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") {
      return;
    }
    try {
      const stored = parseStoredCalibrationSamples(
        window.localStorage.getItem(CALIBRATION_STORAGE_KEY),
      );
      setSamples(stored);
    } catch {
      // 忽略存储读取失败。
    }
  }, [isLoaded]);

  const addCalibration = useCallback(
    (measuredUsd: number): void => {
      const estimate = Number.isFinite(currentEstimateUsd) ? currentEstimateUsd : 0;
      const sample = buildCalibrationSample({
        label: activeSessionId ?? "session",
        estimatedUsd: estimate,
        measuredUsd: measuredUsd,
      });
      setSamples((prev) => [...prev, sample]);
    },
    [activeSessionId, currentEstimateUsd],
  );

  const removeCalibration = useCallback((index: number): void => {
    setSamples((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearCalibrations = useCallback((): void => {
    setSamples([]);
  }, []);

  const viewModel = buildCalibrationViewModel(samples);

  return {
    viewModel,
    addCalibration,
    removeCalibration,
    clearCalibrations,
  };
}
