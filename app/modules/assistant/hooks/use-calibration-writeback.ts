import { useCallback, useEffect, useMemo, useState } from "react";

import type { CalibrationViewModel } from "@/modules/assistant/lib/calibration-store";
import {
  buildCalibrationWriteback,
  CALIBRATION_WRITEBACK_STORAGE_KEY,
  computeCalibrationFactor,
  EMPTY_CALIBRATION_WRITEBACK,
  parseStoredCalibrationWriteback,
  serializeCalibrationWriteback,
  type CalibrationWriteback,
} from "@/modules/assistant/lib/calibration-writeback";
import { summarizeCalibration } from "@/modules/assistant/lib/cost-calibration";

export type UseCalibrationWritebackOptions = {
  /** 校准视图模型（用于在 `needsCalibration` 时推导校正系数）。 */
  viewModel: CalibrationViewModel;
  /** 会话列表是否已加载完成（用于跨会话重读存储）。 */
  isLoaded: boolean;
};

export type UseCalibrationWritebackResult = {
  /** 当前应用的校准回写视图。 */
  writeback: CalibrationWriteback;
  /** 由当前校准样本推导出的「建议校正系数」（无需回写时为 null）。 */
  suggestedFactor: number | null;
  /** 把当前建议校正系数应用到估算单价（回写）。 */
  applyWriteback: () => void;
  /** 应用指定校正系数（供 UI 显式传参）。 */
  applyWritebackFactor: (factor: number) => void;
  /** 清除已应用的校准回写，恢复原始估算单价。 */
  resetWriteback: () => void;
};

/**
 * 校准偏差自动回写估算单价的状态 hook。
 *
 * 收敛「校准面板 → 回写估算单价」的状态：
 *   - 惰性初始化从 localStorage 读取已应用的回写（`parseStoredCalibrationWriteback`，
 *     容错解析，非法数据 → 空回写）；
 *   - `applyWriteback` 用当前校准样本推导的系数回写（`computeCalibrationFactor`）；
 *     `applyWritebackFactor` 显式指定系数回写；`resetWriteback` 清除回写；
 *   - 回写元信息（系数 / 派生时间 / 汇总偏差）随回写一并持久化。
 *
 * 存储副作用（localStorage）封装在本 hook 内；纯决策委托给
 * `lib/calibration-writeback.ts` 的纯函数。
 */
export function useCalibrationWriteback({
  viewModel,
  isLoaded,
}: UseCalibrationWritebackOptions): UseCalibrationWritebackResult {
  const [writeback, setWriteback] = useState<CalibrationWriteback>(() => {
    if (typeof window === "undefined") {
      return { ...EMPTY_CALIBRATION_WRITEBACK };
    }
    try {
      return parseStoredCalibrationWriteback(
        window.localStorage.getItem(CALIBRATION_WRITEBACK_STORAGE_KEY),
      );
    } catch {
      return { ...EMPTY_CALIBRATION_WRITEBACK };
    }
  });

  // 持久化回写（仅在变化时写入）。
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      if (writeback.applied) {
        window.localStorage.setItem(
          CALIBRATION_WRITEBACK_STORAGE_KEY,
          serializeCalibrationWriteback(writeback),
        );
      } else {
        window.localStorage.removeItem(CALIBRATION_WRITEBACK_STORAGE_KEY);
      }
    } catch {
      // localStorage 不可用时忽略，仅内存态生效。
    }
  }, [writeback]);

  // isLoaded 翻转（会话加载完成后）时重读存储，保持跨会话一致性。
  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") {
      return;
    }
    try {
      setWriteback(
        parseStoredCalibrationWriteback(
          window.localStorage.getItem(CALIBRATION_WRITEBACK_STORAGE_KEY),
        ),
      );
    } catch {
      // 忽略存储读取失败。
    }
  }, [isLoaded]);

  const suggestedFactor = useMemo(
    () => computeCalibrationFactor(viewModel.samples),
    [viewModel.samples],
  );

  const persistWriteback = useCallback(
    (factor: number, now: number = Date.now()): void => {
      const summary = summarizeCalibration(viewModel.samples);
      setWriteback(
        buildCalibrationWriteback(factor, summary.totalRelativeDeltaPct, now),
      );
    },
    [viewModel.samples],
  );

  const applyWriteback = useCallback((): void => {
    const factor = computeCalibrationFactor(viewModel.samples);
    if (factor === null) {
      // 无有效系数时清空回写（避免残留）。
      setWriteback({ ...EMPTY_CALIBRATION_WRITEBACK });
      return;
    }
    persistWriteback(factor);
  }, [viewModel.samples, persistWriteback]);

  const applyWritebackFactor = useCallback(
    (factor: number): void => {
      if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
        setWriteback({ ...EMPTY_CALIBRATION_WRITEBACK });
        return;
      }
      persistWriteback(factor);
    },
    [persistWriteback],
  );

  const resetWriteback = useCallback((): void => {
    setWriteback({ ...EMPTY_CALIBRATION_WRITEBACK });
  }, []);

  return {
    writeback,
    suggestedFactor,
    applyWriteback,
    applyWritebackFactor,
    resetWriteback,
  };
}
