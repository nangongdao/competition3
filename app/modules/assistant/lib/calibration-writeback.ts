/**
 * 校准偏差自动回写估算单价（calibration writeback）。
 *
 * §8.18 的成本校准工作台（`lib/calibration-store.ts`）只能把「估算 vs 实测」偏差
 * 展示出来并**提示**用户「建议回调估算单价」，但回调仍停留在口头建议，用户得手动
 * 到别处改单价假设，前端估算成本也并不会随之校正。本模块把这一闭环补完：
 *   - 由校准样本推导一个**校正系数**（measured / estimated，即相对偏差的 1:1 映射）；
 *   - 提供 `applyCalibrationFactor` 把该系数作用到任意「估算成本」上得到**校正估算**；
 *   - 定义 `CalibrationWriteback` 视图（是否已回写 / 系数 / 派生时间 / 汇总偏差），
 *     并提供 localStorage 容错序列化 / 反序列化。
 *
 * 校正系数只在「偏差超过校准阈值（`|delta%| > 10%`）」且样本有效时才有意义，避免把
 * 噪声当信号回写。系数被夹在 `[MIN_FACTOR, MAX_FACTOR]` 之间，防止异常账单把后续
 * 估算放大/缩小到离谱。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用；存储副作用由调用方负责。
 */

import {
  summarizeCalibration,
  type CalibrationSample,
} from "./cost-calibration";
import { CALIBRATION_WARN_DELTA_PCT } from "./calibration-store";

/** 允许回写的最小校正系数（估算缩水到 1/5）。 */
export const MIN_CALIBRATION_FACTOR = 0.2;
/** 允许回写的最大校正系数（估算放大到 5 倍）。 */
export const MAX_CALIBRATION_FACTOR = 5;
/** 估算侧必须为正才允许回写（否则无法求比例）。 */
const MIN_ESTIMATE_FOR_FACTOR = 0.0001;

/**
 * 由一组校准样本推导校正系数。
 *
 * `factor = totalMeasuredUsd / totalEstimatedUsd`。仅在满足以下条件时才返回有效系数，
 * 否则返回 `null`（表示「不值得回写 / 数据不足以回写」）：
 *   - 至少有一条样本，且估算总额与实测总额都为正；
 *   - 汇总相对偏差超过 `CALIBRATION_WARN_DELTA_PCT`（`needsCalibration`）；
 *   - 系数在 `[MIN_CALIBRATION_FACTOR, MAX_CALIBRATION_FACTOR]` 内（夹紧到边界）。
 *
 * @param samples 校准样本。
 * @returns 校正系数（>0）或 `null`（无需 / 无法回写）。
 */
export function computeCalibrationFactor(
  samples: readonly CalibrationSample[],
): number | null {
  if (samples.length === 0) {
    return null;
  }

  const summary = summarizeCalibration(samples);
  if (
    summary.totalEstimatedUsd < MIN_ESTIMATE_FOR_FACTOR ||
    summary.totalMeasuredUsd <= 0
  ) {
    return null;
  }

  const deviationPct = Math.abs(summary.totalRelativeDeltaPct);
  if (deviationPct <= CALIBRATION_WARN_DELTA_PCT) {
    return null;
  }

  const rawFactor = summary.totalMeasuredUsd / summary.totalEstimatedUsd;
  return Math.min(
    MAX_CALIBRATION_FACTOR,
    Math.max(MIN_CALIBRATION_FACTOR, rawFactor),
  );
}

/**
 * 把校正系数作用到一份估算成本上，得到校正后的估算成本（USD）。
 *
 * `corrected = estimated * factor`，夹到非负有限值。`factor` 非法（非有限 / ≤0）时
 * 原样返回 `estimated`，保证回写关闭或不合理时退化为原始估算。
 *
 * @param estimatedUsd 原始估算成本（USD）。
 * @param factor 校正系数（>0）。
 * @returns 校正后估算成本（USD）。
 */
export function applyCalibrationFactor(
  estimatedUsd: number,
  factor: number,
): number {
  if (!Number.isFinite(estimatedUsd)) {
    return 0;
  }
  if (!Number.isFinite(factor) || factor <= 0) {
    return Math.max(0, estimatedUsd);
  }
  const corrected = estimatedUsd * factor;
  return Math.max(0, corrected);
}

/** 已应用的校准回写视图模型。 */
export type CalibrationWriteback = {
  /** 是否处于「已回写」状态（factor 被应用）。 */
  applied: boolean;
  /** 校正系数（`applied` 为 true 时有意义；否则 1 表示不校正）。 */
  factor: number;
  /** 派生该系数时的时间（ms）。 */
  derivedAt: number;
  /** 派生该系数时的汇总相对偏差（%），用于展示回写理由。 */
  totalRelativeDeltaPct: number;
};

/** localStorage 中「已应用的校准回写」的存储键。 */
export const CALIBRATION_WRITEBACK_STORAGE_KEY =
  "assistant.calibration-writeback";

/** 尚未回写时的默认视图。 */
export const EMPTY_CALIBRATION_WRITEBACK: CalibrationWriteback = {
  applied: false,
  factor: 1,
  derivedAt: 0,
  totalRelativeDeltaPct: 0,
};

/**
 * 由校正系数 + 汇总派生「已回写」视图。
 *
 * 把应用回写的元信息（系数、时间、汇总偏差）封装为稳定的视图模型，便于组件渲染
 * 与 localStorage 持久化。仅当 `factor` 有效（>0 且 ≠1）时置 `applied=true`。
 *
 * @param factor 校正系数。
 * @param summary 校准汇总（提供总相对偏差用于展示）。
 * @param now 派生时间（ms）。
 * @returns 校准回写视图。
 */
export function buildCalibrationWriteback(
  factor: number,
  totalRelativeDeltaPct: number,
  now: number = Date.now(),
): CalibrationWriteback {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    return { ...EMPTY_CALIBRATION_WRITEBACK, derivedAt: now };
  }
  return {
    applied: true,
    factor,
    derivedAt: now,
    totalRelativeDeltaPct,
  };
}

/** 把 `CalibrationWriteback` 序列化为可持久化的 JSON 字符串。 */
export function serializeCalibrationWriteback(
  writeback: CalibrationWriteback,
): string {
  return JSON.stringify(writeback);
}

/** 从 localStorage 字符串解析 `CalibrationWriteback`（容错，非法 → 默认空）。 */
export function parseStoredCalibrationWriteback(
  raw: string | null | undefined,
): CalibrationWriteback {
  if (raw === null || raw === undefined) {
    return { ...EMPTY_CALIBRATION_WRITEBACK };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...EMPTY_CALIBRATION_WRITEBACK };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ...EMPTY_CALIBRATION_WRITEBACK };
  }

  const record = parsed as Record<string, unknown>;
  const applied = record.applied === true;
  const factor =
    typeof record.factor === "number" && Number.isFinite(record.factor)
      ? record.factor
      : 1;
  const derivedAt =
    typeof record.derivedAt === "number" && Number.isFinite(record.derivedAt)
      ? record.derivedAt
      : 0;
  const totalRelativeDeltaPct =
    typeof record.totalRelativeDeltaPct === "number" &&
    Number.isFinite(record.totalRelativeDeltaPct)
      ? record.totalRelativeDeltaPct
      : 0;

  return { applied, factor, derivedAt, totalRelativeDeltaPct };
}
