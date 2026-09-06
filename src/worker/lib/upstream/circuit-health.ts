import type { UpstreamCircuitBreaker } from "../../durable-objects/upstream-circuit-breaker";
import type { CloudflareBindings } from "../../types";
import type { CircuitShardSnapshot } from "../../routes/circuit/types";

/** 上游操作族：与 `acquireCircuitLease` 的 operation 取值保持一致。 */
export type CircuitHealthOperation =
  | "chat"
  | "realtime"
  | "transcription";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * 解析某个操作族的上游 provider origin。
 *
 * 与各路由的 provider URL 解析保持一致（各自 base 优先，回退 OPENAI_BASE_URL，
 * 再回退默认 OpenAI 基址），仅取 URL 的 origin 用于熔断分片定位。
 * 解析失败返回 null（该操作族将不出现在健康报告中）。
 */
export function resolveCircuitOperationOrigin(
  env: CloudflareBindings,
  operation: CircuitHealthOperation,
): string | null {
  let baseUrl: string;

  if (operation === "chat") {
    baseUrl =
      env.OPENAI_CHAT_BASE_URL ??
      env.OPENAI_BASE_URL ??
      DEFAULT_OPENAI_BASE_URL;
  } else if (operation === "realtime") {
    baseUrl =
      env.OPENAI_REALTIME_BASE_URL ??
      env.OPENAI_BASE_URL ??
      DEFAULT_OPENAI_BASE_URL;
  } else {
    baseUrl =
      env.OPENAI_TRANSCRIPTION_BASE_URL ??
      env.OPENAI_BASE_URL ??
      DEFAULT_OPENAI_BASE_URL;
  }

  const trimmed = baseUrl.trim();

  if (trimmed.length === 0) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/**
 * 只读枚举配置涉及的熔断分片并读取各自快照。
 *
 * 对 chat / realtime / transcription 三个操作族，解析配置的 provider origin，
 * 通过 `getByName("<origin>|<operation>")` 读取只读快照。未使用过的分片返回
 * 默认关闭态（正确反映「当前未熔断」）。单分片 RPC 失败时跳过该分片。
 *
 * @returns 按 origin → operation 排序的分片快照数组
 */
export async function readCircuitHealthShards(input: {
  env: CloudflareBindings;
  namespace:
    | DurableObjectNamespace<UpstreamCircuitBreaker>
    | undefined;
}): Promise<CircuitShardSnapshot[]> {
  if (input.namespace === undefined) {
    return [];
  }

  const shards: CircuitShardSnapshot[] = [];
  const operations: CircuitHealthOperation[] = [
    "chat",
    "realtime",
    "transcription",
  ];

  for (const operation of operations) {
    const origin = resolveCircuitOperationOrigin(input.env, operation);

    if (origin === null) {
      continue;
    }

    const name = `${origin}|${operation}`;
    const stub = input.namespace.getByName(name);

    try {
      const state = await stub.snapshot();
      shards.push({ name, origin, operation, state });
    } catch {
      // 单分片 RPC 失败：跳过该分片，不阻断其余分片枚举
      continue;
    }
  }

  shards.sort((a, b) => {
    if (a.origin === b.origin) {
      return a.operation.localeCompare(b.operation);
    }
    return a.origin.localeCompare(b.origin);
  });

  return shards;
}
