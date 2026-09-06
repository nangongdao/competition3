/**
 * 帧采样性能遥测（纯函数统计）。
 *
 * 记录离屏 Worker 帧处理耗时，把一次采样的 `processMs` 折叠进不可变统计快照，
 * 供 UI/答辩展示「平均帧处理耗时」「最近耗时」等派生指标，验证 Worker 侧
 * off-thread 采样的实际性能收益（主线程不阻塞）。
 *
 * 同时记录**采样节拍**（相邻两次采样的时间间隔），派生出实际采样频率（FPS），
 * 用于监控自动采样的节拍是否与配置间隔一致，作为性能度量基线的一环。
 */

/** 帧采样性能统计快照。 */
export type FrameTelemetryState = {
  /** 已记录的有效采样次数。 */
  readonly count: number;
  /** 累计处理耗时（ms）。 */
  readonly totalMs: number;
  /** 单次最大耗时（ms）。 */
  readonly maxMs: number;
  /** 最近一次耗时（ms）。 */
  readonly lastMs: number;
  /** 已记录的有效采样间隔次数（相邻两次采样）。 */
  readonly tickCount: number;
  /** 累计采样间隔（ms）。 */
  readonly totalIntervalMs: number;
  /** 最近一次采样间隔（ms）。 */
  readonly lastIntervalMs: number;
  /** 上一次采样时间戳（ms，用于推算间隔；缺省 -1）。 */
  readonly lastTimestampMs: number;
};

/** 初始（空）统计快照。 */
export const EMPTY_FRAME_TELEMETRY: FrameTelemetryState = Object.freeze({
  count: 0,
  totalMs: 0,
  maxMs: 0,
  lastMs: 0,
  tickCount: 0,
  totalIntervalMs: 0,
  lastIntervalMs: 0,
  lastTimestampMs: -1,
});

function normalizeProcessMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

/**
 * 把一次采样的处理耗时折叠进统计快照。
 *
 * @param state 当前快照
 * @param processMs 本次处理耗时（ms）；非法/负值按 0 处理
 * @returns 更新后的不可变快照
 */
export function recordFrameTelemetry(
  state: FrameTelemetryState,
  processMs: number,
): FrameTelemetryState {
  const normalized = normalizeProcessMs(processMs);

  return {
    ...state,
    count: state.count + 1,
    totalMs: state.totalMs + normalized,
    maxMs: Math.max(state.maxMs, normalized),
    lastMs: normalized,
  };
}

/**
 * 记录一次采样事件（更新采样节拍统计）。
 *
 * 基于当前时间戳与快照内上一次采样时间戳推算采样间隔：
 * 首次采样（无上一次时间戳）只记录时间戳不产生间隔；
 * 非法时间戳 / 非递增时间戳按 0 间隔处理并仅更新时间戳。
 *
 * @param state 当前快照
 * @param timestampMs 本次采样的高精度时间戳（performance.now()，ms）
 * @returns 更新后的不可变快照
 */
export function recordSampleTick(
  state: FrameTelemetryState,
  timestampMs: number,
): FrameTelemetryState {
  const normalizedTs =
    Number.isFinite(timestampMs) && timestampMs >= 0 ? timestampMs : 0;
  const previousTs = state.lastTimestampMs;

  if (previousTs < 0 || normalizedTs < previousTs) {
    return {
      ...state,
      lastTimestampMs: normalizedTs,
    };
  }

  const intervalMs = normalizedTs - previousTs;

  return {
    ...state,
    tickCount: state.tickCount + 1,
    totalIntervalMs: state.totalIntervalMs + intervalMs,
    lastIntervalMs: intervalMs,
    lastTimestampMs: normalizedTs,
  };
}

/** 采样节拍派生指标。 */
export type SampleRateStats = {
  /** 平均采样频率（FPS）；无有效间隔时为 0。 */
  readonly averageFps: number;
  /** 最近一次采样间隔（ms）；无有效间隔时为 0。 */
  readonly lastIntervalMs: number;
  /** 最近一次采样频率（FPS）；无有效间隔时为 0。 */
  readonly lastFps: number;
  /** 有效采样间隔次数。 */
  readonly tickCount: number;
};

/**
 * 从统计快照派生采样节拍指标。
 *
 * 平均频率 = 累计间隔 / 次数 换算为每秒帧数；无有效间隔返回全 0。
 *
 * @param state 统计快照
 * @returns 平均 / 最近采样频率与最近间隔
 */
export function deriveSampleRateStats(
  state: FrameTelemetryState,
): SampleRateStats {
  if (state.tickCount === 0) {
    return {
      averageFps: 0,
      lastIntervalMs: 0,
      lastFps: 0,
      tickCount: 0,
    };
  }

  const averageIntervalMs = state.totalIntervalMs / state.tickCount;
  const averageFps = averageIntervalMs > 0 ? 1000 / averageIntervalMs : 0;
  const lastFps = state.lastIntervalMs > 0 ? 1000 / state.lastIntervalMs : 0;

  return {
    averageFps,
    lastIntervalMs: state.lastIntervalMs,
    lastFps,
    tickCount: state.tickCount,
  };
}

/** 帧采样性能派生指标。 */
export type FrameTelemetryStats = {
  /** 平均处理耗时（ms）；无采样时为 0。 */
  readonly averageMs: number;
  /** 单次最大耗时（ms）。 */
  readonly maxMs: number;
  /** 最近一次耗时（ms）。 */
  readonly lastMs: number;
  /** 累计采样次数。 */
  readonly count: number;
};

/**
 * 从统计快照派生展示用指标。
 *
 * @param state 统计快照
 * @returns 平均 / 最大 / 最近耗时与次数
 */
export function deriveFrameTelemetryStats(
  state: FrameTelemetryState,
): FrameTelemetryStats {
  const averageMs =
    state.count === 0 ? 0 : state.totalMs / state.count;

  return {
    averageMs,
    maxMs: state.maxMs,
    lastMs: state.lastMs,
    count: state.count,
  };
}
