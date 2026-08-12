import type { MiddlewareHandler } from "hono";

import type { RateLimiter } from "../durable-objects/rate-limiter";
import type { AppEnv } from "../types";

/**
 * 限流中间件。
 *
 * 以 CF-Connecting-IP 作为限流键。注意：IP 可被代理池绕过，
 * 因此这是成本控制手段而非严格的安全边界。
 *
 * 未配置 RATE_LIMITER 绑定（如本地单测）或 DO 瞬时不可用（迁移/故障）
 * 时放行 —— 与熔断器 `circuit-client` 的 fail-open 策略保持一致：
 * 限流是成本防护，不应在防护层故障时把合法请求一起打挂。
 *
 * @param endpoint 端点标识，用于选择配额档位
 */
export function rateLimit(endpoint: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const namespace = c.env.RATE_LIMITER as
      | DurableObjectNamespace<RateLimiter>
      | undefined;

    if (namespace === undefined) {
      await next();
      return;
    }

    const ip = c.req.header("cf-connecting-ip") ?? "unknown";

    try {
      const stub = namespace.getByName(`${endpoint}:${ip}`);
      const result = await stub.consume(endpoint);

      if (!result.allowed) {
        return c.json(
          {
            success: false,
            error: `请求过于频繁，请 ${result.retryAfterSeconds} 秒后重试。`,
            code: "rate_limited",
          },
          429,
          { "Retry-After": String(result.retryAfterSeconds) },
        );
      }
    } catch {
      // 限流器故障时降级放行（fail-open），避免防护层自身把服务打挂
      await next();
      return;
    }

    await next();
  };
}
