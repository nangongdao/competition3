import type { CircuitSnapshot } from "../../durable-objects/upstream-circuit-state";

/**
 * 熔断器只读健康端点（`GET /api/circuit`）的输出类型。
 *
 * 该端点枚举所有已实例化的熔断分片（provider origin × operation），
 * 返回每个分片的只读状态快照，供监控/告警消费。不提供任何写操作。
 */
export type CircuitShardSnapshot = {
  /** DO 分片实例名（`<origin>|<operation>`）。 */
  name: string;
  /** 上游供应商 origin（如 `https://api.openai.com`）。 */
  origin: string;
  /** 熔断分片所属操作族（chat / realtime / transcription）。 */
  operation: "chat" | "realtime" | "transcription" | "unknown";
  /** 只读熔断状态快照。 */
  state: CircuitSnapshot;
};

export type CircuitHealthOutput = {
  success: true;
  /** Unix 毫秒时间戳。 */
  timestamp: number;
  /** 当前正在拒绝请求的分片数。 */
  openShardCount: number;
  /** 已实例化的熔断分片列表。 */
  shards: readonly CircuitShardSnapshot[];
};

/**
 * 熔断器绑定缺失或枚举失败时的降级响应。
 * 与 `circuit-client` 的 fail-open 语义一致：不把控制面故障变成总故障。
 */
export type CircuitHealthDegradedOutput = {
  success: false;
  timestamp: number;
  shards: readonly [];
  openShardCount: 0;
  error: string;
};
