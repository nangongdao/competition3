import { DurableObject } from "cloudflare:workers";

import type { CloudflareBindings } from "../types";
import { tryConsume, type RateLimitConsumption } from "./rate-limit-state";

/**
 * 按 (IP, endpoint) 维度的滑动窗口限流器。
 *
 * 每个限流键对应一个 DO 实例，状态保存在实例内存中：
 * DO 被驱逐后窗口重置，表现为"放宽"而非"收紧"，符合成本控制（而非
 * 严格安全边界）的定位 —— 参见 `rate-limit-state.ts` 顶部注释。
 */
export class RateLimiter extends DurableObject<CloudflareBindings> {
  private timestamps: number[] = [];

  /**
   * 消费一次配额。
   *
   * @param endpoint 端点标识（chat / speech / realtime）
   * @returns 是否允许本次请求，以及需要等待的秒数
   */
  consume(endpoint: string): RateLimitConsumption {
    const { consumption, nextTimestamps } = tryConsume(
      this.timestamps,
      endpoint,
      Date.now(),
    );

    this.timestamps = nextTimestamps;
    return consumption;
  }
}
