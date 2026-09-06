/**
 * 成本校准辅助（② Live cost measurement 实测与校准）。
 *
 * 前端展示的「估算成本」是把 token 用量按某套硬编码单价换算成 USD。
 * 真实账单以 provider 控制台为准，两者之间可能存在偏差（单价漂移、
 * 计费粒度差异、缓存命中率假设等）。本模块提供：
 *   - 估算 vs 实测成本的差异度量（绝对差 / 相对偏差百分比）；
 *   - 一套可复现的校准记录类型（记录使用的价格集、实测来源、观测点）；
 *   - 计算实测单价（USD / 1M token），便于与前端硬编码单价对照。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

/** 校准观测记录：一次「同一场景下的估算 vs 实测」对照。 */
export type CalibrationSample = {
  /** 观测点标识（会话 id / 场景名 / 时间戳）。 */
  label: string;
  /** 前端估算成本（USD）。 */
  estimatedUsd: number;
  /** 实测账单成本（USD），来自 provider 控制台 / 账单 API。 */
  measuredUsd: number;
  /** 该观测的 token 用量（用于换算实测单价）。 */
  inputTokens?: number;
  outputTokens?: number;
  /** 观测时间（ms）。 */
  recordedAt: number;
};

/** 一次校准观测的差异度量结果。 */
export type CalibrationDelta = {
  label: string;
  estimatedUsd: number;
  measuredUsd: number;
  /** 绝对偏差 = measured - estimated（USD）。 */
  absoluteDeltaUsd: number;
  /** 相对偏差（%）；estimated 为 0 时返回 0。 */
  relativeDeltaPct: number;
  /** 实测是否高于估算（正偏差）。 */
  overrun: boolean;
};

/** 一组校准观测的汇总统计。 */
export type CalibrationSummary = {
  samples: readonly CalibrationSample[];
  /** 估算总成本（USD）。 */
  totalEstimatedUsd: number;
  /** 实测总成本（USD）。 */
  totalMeasuredUsd: number;
  /** 总绝对偏差（USD）。 */
  totalAbsoluteDeltaUsd: number;
  /** 总相对偏差（%）。 */
  totalRelativeDeltaPct: number;
  /** 实测是否整体高于估算。 */
  overrun: boolean;
};

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 计算单次观测的差异度量。
 *
 * @param sample 校准观测记录。
 * @returns 差异度量结果（label 透传）。
 */
export function computeCalibrationDelta(
  sample: CalibrationSample,
): CalibrationDelta {
  const estimated = clampNonNegative(sample.estimatedUsd);
  const measured = clampNonNegative(sample.measuredUsd);
  const absoluteDeltaUsd = measured - estimated;
  const relativeDeltaPct =
    estimated > 0 ? (absoluteDeltaUsd / estimated) * 100 : 0;

  return {
    label: sample.label,
    estimatedUsd: estimated,
    measuredUsd: measured,
    absoluteDeltaUsd,
    relativeDeltaPct,
    overrun: measured > estimated,
  };
}

/**
 * 汇总一组校准观测。
 *
 * @param samples 校准观测记录。
 * @returns 汇总统计（含逐条差异 + 总量）。
 */
export function summarizeCalibration(
  samples: readonly CalibrationSample[],
): CalibrationSummary {
  const deltas = samples.map(computeCalibrationDelta);
  const totalEstimatedUsd = deltas.reduce((s, d) => s + d.estimatedUsd, 0);
  const totalMeasuredUsd = deltas.reduce((s, d) => s + d.measuredUsd, 0);
  const totalAbsoluteDeltaUsd = totalMeasuredUsd - totalEstimatedUsd;
  const totalRelativeDeltaPct =
    totalEstimatedUsd > 0
      ? (totalAbsoluteDeltaUsd / totalEstimatedUsd) * 100
      : 0;

  return {
    samples,
    totalEstimatedUsd,
    totalMeasuredUsd,
    totalAbsoluteDeltaUsd,
    totalRelativeDeltaPct,
    overrun: totalMeasuredUsd > totalEstimatedUsd,
  };
}

/**
 * 由 token 用量 + 实测账单计算实测单价（USD / 1M token）。
 *
 * 用于把「实测单价」与前端硬编码单价对照，判断价格假设是否需要校准。
 *
 * @param measuredUsd 实测账单成本（USD）。
 * @param inputTokens 输入 token 数。
 * @param outputTokens 输出 token 数。
 * @returns 实测混合单价（USD / 1M token）；token 为 0 时返回 0。
 */
export function measuredPricePerMillion(
  measuredUsd: number,
  inputTokens: number,
  outputTokens: number,
): number {
  const cost = clampNonNegative(measuredUsd);
  const tokens = clampNonNegative(inputTokens) + clampNonNegative(outputTokens);

  if (tokens <= 0) {
    return 0;
  }

  return (cost / tokens) * 1_000_000;
}

/**
 * 校准记录类型（用于文档 / 持久化的规范化结构）。
 */
export type CalibrationRecord = {
  schemaVersion: 1;
  /** 使用的估算价格集（对应 cost-model 的输入）。 */
  priceSet: "gpt-realtime-pricing" | "chat-pricing";
  /** 实测来源说明。 */
  source: string;
  /** 生成时间（ms）。 */
  generatedAt: number;
  samples: readonly CalibrationSample[];
};
