/** 限流窗口时长（毫秒）。 */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** 各端点在一个窗口内的请求上限。 */
export const ENDPOINT_RATE_LIMITS: Readonly<Record<string, number>> = {
  chat: 20,
  speech: 15,
  realtime: 3, // Realtime 会话最贵，限制最严
  default: 30,
};

export type RateLimitConsumption =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

/**
 * 丢弃窗口外的记录。
 *
 * @param timestamps 已记录的时间戳（毫秒）
 * @param now 当前时间（毫秒）
 * @returns 仅保留窗口内的时间戳
 */
export function pruneTimestamps(
  timestamps: readonly number[],
  now: number,
): number[] {
  return timestamps.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
}

/**
 * 尝试消费一次配额（滑动窗口）。
 *
 * 纯函数：不修改入参，返回下一次应保存的时间戳列表。
 *
 * @param timestamps 当前窗口内已记录的时间戳
 * @param endpoint 端点标识（chat / speech / realtime）
 * @param now 当前时间（毫秒）
 */
export function tryConsume(
  timestamps: readonly number[],
  endpoint: string,
  now: number,
): { consumption: RateLimitConsumption; nextTimestamps: number[] } {
  const windowedTimestamps = pruneTimestamps(timestamps, now);
  const limit = ENDPOINT_RATE_LIMITS[endpoint] ?? ENDPOINT_RATE_LIMITS.default;

  if (windowedTimestamps.length >= limit) {
    const oldest = windowedTimestamps[0];
    const retryAfterMs = oldest === undefined ? 0 : RATE_LIMIT_WINDOW_MS - (now - oldest);

    return {
      consumption: {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      },
      nextTimestamps: windowedTimestamps,
    };
  }

  return {
    consumption: { allowed: true, retryAfterSeconds: 0 },
    nextTimestamps: [...windowedTimestamps, now],
  };
}
