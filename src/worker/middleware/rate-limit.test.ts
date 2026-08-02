import { describe, expect, it, vi } from "vitest";

import { Hono } from "hono";

import {
  createBlockingRateLimitNamespace,
  createRateLimitNamespace,
} from "../test-utils/rate-limit";
import type { AppEnv, CloudflareBindings } from "../types";
import { rateLimit } from "./rate-limit";

function createTestApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("/api/chat/*", rateLimit("chat"));
  app.post("/api/chat/completion", (c) => c.json({ ok: true }));

  return app;
}

async function request(
  app: Hono<AppEnv>,
  bindings: Partial<CloudflareBindings>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await app.request(
    "/api/chat/completion",
    { method: "POST", headers },
    bindings,
  );
}

describe("rate limit middleware", () => {
  it("allows requests while the limiter grants a quota", async () => {
    const app = createTestApp();
    const response = await request(app, {
      RATE_LIMITER: createRateLimitNamespace() as unknown as CloudflareBindings["RATE_LIMITER"],
    });

    expect(response.status).toBe(200);
  });

  it("returns 429 with Retry-After when the limiter rejects", async () => {
    const app = createTestApp();
    const response = await request(
      app,
      {
        RATE_LIMITER: createBlockingRateLimitNamespace(
          30,
        ) as unknown as CloudflareBindings["RATE_LIMITER"],
      },
      { "CF-Connecting-IP": "203.0.113.7" },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toMatchObject({
      success: false,
      code: "rate_limited",
    });
  });

  it("passes requests through when the RATE_LIMITER binding is absent", async () => {
    const app = createTestApp();
    const response = await request(app, {});

    expect(response.status).toBe(200);
  });

  it("keys the limiter instance by IP and endpoint", async () => {
    const getByName = vi.fn(() => ({
      consume: async (): Promise<{ allowed: true; retryAfterSeconds: 0 }> => ({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));
    const namespace = { getByName } as unknown as CloudflareBindings["RATE_LIMITER"];
    const app = createTestApp();

    await request(app, { RATE_LIMITER: namespace }, {
      "CF-Connecting-IP": "203.0.113.9",
    });

    expect(getByName).toHaveBeenCalledWith("chat:203.0.113.9");
  });
});
