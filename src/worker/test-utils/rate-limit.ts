import type { RateLimiter } from "../durable-objects/rate-limiter";
import type { RateLimitConsumption } from "../durable-objects/rate-limit-state";

type ConsumeHandler = (endpoint: string) => RateLimitConsumption;

/**
 * 构造一个 RATE_LIMITER 的测试替身。
 *
 * @param consume 每次调用的返回策略（默认全部放行）
 */
export function createRateLimitNamespace(
  consume: ConsumeHandler = () => ({ allowed: true, retryAfterSeconds: 0 }),
): DurableObjectNamespace<RateLimiter> {
  const namespace = {
    getByName: () => ({
      consume: async (endpoint: string): Promise<RateLimitConsumption> =>
        consume(endpoint),
    }),
  };

  return namespace as unknown as DurableObjectNamespace<RateLimiter>;
}

/**
 * 构造一个始终拒绝的测试替身，用于验证 429 响应。
 *
 * @param retryAfterSeconds Retry-After 秒数
 */
export function createBlockingRateLimitNamespace(
  retryAfterSeconds = 30,
): DurableObjectNamespace<RateLimiter> {
  return createRateLimitNamespace(() => ({
    allowed: false,
    retryAfterSeconds,
  }));
}
