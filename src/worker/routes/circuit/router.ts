import { Hono } from "hono";

import type { UpstreamCircuitBreaker } from "../../durable-objects/upstream-circuit-breaker";
import { logWorkerEvent } from "../../lib/logger";
import { readCircuitHealthShards } from "../../lib/upstream/circuit-health";
import type { AppEnv } from "../../types";
import type {
  CircuitHealthDegradedOutput,
  CircuitHealthOutput,
  CircuitShardSnapshot,
} from "./types";

export const circuitRoutes = new Hono<AppEnv>();

/**
 * 熔断器只读健康端点（无上游成本，不套 accessControl/rateLimit）。
 *
 * 枚举 chat / realtime / transcription 三个操作族配置的 provider origin，
 * 读取每个分片的只读状态快照，供监控/告警消费。绑定缺失时降级返回空数组
 * （fail-open），不把控制面故障变成总故障。
 */
circuitRoutes.get("/", async (c) => {
  const timestamp = Date.now();
  const namespace = c.env.UPSTREAM_CIRCUIT_BREAKER as
    | DurableObjectNamespace<UpstreamCircuitBreaker>
    | undefined;

  if (namespace === undefined) {
    logWorkerEvent("warn", "upstream_circuit_binding_missing", {
      requestId: c.get("requestId"),
      operation: "health",
    });
    return c.json<CircuitHealthDegradedOutput>(
      {
        success: false,
        timestamp,
        shards: [],
        openShardCount: 0,
        error: "UPSTREAM_CIRCUIT_BREAKER binding is not configured.",
      },
      503,
    );
  }

  let shards: CircuitShardSnapshot[];

  try {
    shards = await readCircuitHealthShards({ env: c.env, namespace });
  } catch (error: unknown) {
    logWorkerEvent("error", "upstream_circuit_health_failed", {
      requestId: c.get("requestId"),
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return c.json<CircuitHealthDegradedOutput>(
      {
        success: false,
        timestamp,
        shards: [],
        openShardCount: 0,
        error: "Failed to read circuit breaker health.",
      },
      503,
    );
  }

  const output: CircuitHealthOutput = {
    success: true,
    timestamp,
    openShardCount: shards.filter((shard) => shard.state.isOpen).length,
    shards,
  };

  return c.json(output);
});
