import type { UpstreamCircuitBreaker } from "../durable-objects/upstream-circuit-breaker";

export function createOpenCircuitNamespace(
  retryAfterMs = 2_500,
): DurableObjectNamespace<UpstreamCircuitBreaker> {
  const namespace = {
    getByName: () => ({
      acquire: (): Promise<{
        allowed: false;
        retryAfterMs: number;
        mode: "open";
      }> => Promise.resolve({
        allowed: false,
        retryAfterMs,
        mode: "open",
      }),
    }),
  };

  return namespace as unknown as DurableObjectNamespace<UpstreamCircuitBreaker>;
}
