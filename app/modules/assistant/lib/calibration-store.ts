/**
 * 成本校准工作台（in-app cost calibration workspace）纯函数层。
 *
 * `docs/cost-calibration.md` 与 `lib/cost-calibration.ts` 提供了离线校准的纯函数
 * （估算 vs 实测差异度量、实测单价换算），但只能离线跑脚本/单测，无法在应用内使用。
 * 本模块把这些能力接入应用内：
 *   - 解析/校验「实际账单金额」输入；
 *   - 构造 `CalibrationSample`（补 label / recordedAt / 当前估算成本）；
 *   - 折叠样本为「校准视图模型」（逐条 delta + 汇总 + 是否需校准告警）；
 *   - localStorage 持久化（序列化 + 容错解析）。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。存储副作用由调用方负责。
 */

import {
  computeCalibrationDelta,
  summarizeCalibration,
  type CalibrationDelta,
  type CalibrationSample,
  type CalibrationSummary,
} from "./cost-calibration";

/** 相对偏差超过该比例（%）即提示用户需校准单价（与 docs/cost-calibration.md 口径一致）。 */
export const CALIBRATION_WARN_DELTA_PCT = 10;

/**
 * 解析用户输入的「实际账单金额」。
 *
 * 接受数字或字符串（可能来自 input 的 value / localStorage）。规则：
 * - `null` / `undefined` / 空串 → `null`（视为无效输入）。
 * - 非法值（NaN、负数、非有限数）→ `null`。
 * - 0 → `null`（实测账单为 0 无意义）。
 *
 * @param raw 待解析的输入。
 * @returns 有效金额（USD，>0）或 `null`（无效）。
 */
export function parseCalibrationInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const value =
    typeof raw === "string" ? Number(raw.trim()) : typeof raw === "number" ? raw : NaN;

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/**
 * 构造一条校准观测样本。
 *
 * @param input 样本字段（不含 recordedAt；label 通常为当前会话标识）。
 * @returns 规范化 `CalibrationSample`（recordedAt 取当前时间）。
 */
export function buildCalibrationSample(input: {
  label: string;
  estimatedUsd: number;
  measuredUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}): CalibrationSample {
  return {
    label: input.label,
    estimatedUsd: input.estimatedUsd,
    measuredUsd: input.measuredUsd,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    recordedAt: Date.now(),
  };
}

/** 校准视图模型：一组样本 + 逐条差异 + 汇总 + 是否需校准告警。 */
export type CalibrationViewModel = {
  samples: readonly CalibrationSample[];
  /** 逐条差异度量。 */
  deltas: readonly CalibrationDelta[];
  /** 汇总统计。 */
  summary: CalibrationSummary;
  /** 汇总相对偏差是否超过阈值（需提示用户回调单价）。 */
  needsCalibration: boolean;
};

/**
 * 把一组校准样本折叠为校准视图模型。
 *
 * 复用 `cost-calibration.ts` 的 `computeCalibrationDelta` / `summarizeCalibration`。
 * 空样本 → 全零汇总、`needsCalibration=false`。
 *
 * @param samples 校准样本序列。
 * @returns 校准视图模型。
 */
export function buildCalibrationViewModel(
  samples: readonly CalibrationSample[],
): CalibrationViewModel {
  const deltas = samples.map(computeCalibrationDelta);
  const summary = summarizeCalibration(samples);
  const needsCalibration =
    Number.isFinite(summary.totalRelativeDeltaPct) &&
    Math.abs(summary.totalRelativeDeltaPct) > CALIBRATION_WARN_DELTA_PCT;

  return { samples, deltas, summary, needsCalibration };
}

/**
 * 序列化校准样本用于持久化。
 *
 * @param samples 校准样本序列。
 * @returns JSON 字符串。
 */
export function serializeCalibrationSamples(
  samples: readonly CalibrationSample[],
): string {
  return JSON.stringify(samples);
}

/**
 * 从 localStorage 读取的字符串解析校准样本。
 *
 * 容错解析：非法 JSON、非数组、元素结构非法 → 返回空数组（不抛异常），
 * 使持久化损坏不会导致应用崩溃。字段类型不匹配的条目被丢弃。
 *
 * @param raw localStorage 原始字符串（null 表示未存储）。
 * @returns 合法校准样本数组（可能为空）。
 */
export function parseStoredCalibrationSamples(
  raw: string | null | undefined,
): CalibrationSample[] {
  if (raw === null || raw === undefined) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const samples: CalibrationSample[] = [];
  for (const item of parsed) {
    if (!isCalibrationSample(item)) {
      continue;
    }
    samples.push(item);
  }
  return samples;
}

/** 校验对象是否为合法 `CalibrationSample`（字段类型 / 有限值）。 */
function isCalibrationSample(value: unknown): value is CalibrationSample {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const labelOk = typeof record.label === "string";
  const estimatedOk =
    typeof record.estimatedUsd === "number" && Number.isFinite(record.estimatedUsd);
  const measuredOk =
    typeof record.measuredUsd === "number" && Number.isFinite(record.measuredUsd);
  const recordedAtOk =
    typeof record.recordedAt === "number" && Number.isFinite(record.recordedAt);
  const inputTokensOk =
    record.inputTokens === undefined ||
    (typeof record.inputTokens === "number" && Number.isFinite(record.inputTokens));
  const outputTokensOk =
    record.outputTokens === undefined ||
    (typeof record.outputTokens === "number" && Number.isFinite(record.outputTokens));

  return (
    labelOk &&
    estimatedOk &&
    measuredOk &&
    recordedAtOk &&
    inputTokensOk &&
    outputTokensOk
  );
}
