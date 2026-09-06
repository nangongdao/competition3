import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import app from "../../app";
import type { UpstreamCircuitBreaker } from "../../durable-objects/upstream-circuit-breaker";
import type { CloudflareBindings } from "../../types";
import type { CircuitHealthOutput } from "./types";

const mockAssets: Fetcher = {
  fetch: async (): Promise<Response> => new Response("not found", { status: 404 }),
  connect: (): Socket => {
    throw new Error("ASSETS.connect is not used in route tests.");
  },
};

function createEnv(): CloudflareBindings {
  return {
    ASSETS: mockAssets,
    ENVIRONMENT: "test",
    UPSTREAM_CIRCUIT_BREAKER: env.UPSTREAM_CIRCUIT_BREAKER,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("circuit health route", () => {
  it("returns 503 with a degraded payload when the binding is missing", async () => {
    const response = await app.request(
      "/api/circuit",
      { method: "GET" },
      { ...createEnv(), UPSTREAM_CIRCUIT_BREAKER: undefined },
    );
    const body = await readJson<{ success: boolean; error: string }>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toContain("not configured");
  });

  it("lists configured shards with their read-only state", async () => {
    const namespace = env.UPSTREAM_CIRCUIT_BREAKER;

    if (namespace === undefined) {
      throw new Error("UPSTREAM_CIRCUIT_BREAKER test binding is missing.");
    }

    // 预置：让 chat 分片打开，其余保持关闭
    const chatStub = namespace.getByName(
      "https://api.openai.com|chat",
    ) as DurableObjectStub<UpstreamCircuitBreaker>;
    for (let failure = 0; failure < 3; failure += 1) {
      const permit = await chatStub.acquire();
      expect(permit.allowed).toBe(true);
      if (!permit.allowed) {
        throw new Error("Expected a closed-circuit permit.");
      }
      await chatStub.recordFailure(permit.generation);
    }

    const response = await app.request(
      "/api/circuit",
      { method: "GET" },
      createEnv(),
    );
    const body = await readJson<CircuitHealthOutput>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // chat / realtime / transcription 三个操作族都基于默认 origin 解析
    const chatShard = body.shards.find(
      (shard) => shard.operation === "chat",
    );
    const realtimeShard = body.shards.find(
      (shard) => shard.operation === "realtime",
    );

    expect(chatShard).toBeDefined();
    expect(realtimeShard).toBeDefined();

    if (chatShard !== undefined) {
      expect(chatShard.origin).toBe("https://api.openai.com");
      expect(chatShard.state.mode).toBe("open");
      expect(chatShard.state.isOpen).toBe(true);
    }

    if (realtimeShard !== undefined) {
      expect(realtimeShard.state.mode).toBe("closed");
      expect(realtimeShard.state.isOpen).toBe(false);
    }

    expect(body.openShardCount).toBeGreaterThanOrEqual(1);
  });
});
