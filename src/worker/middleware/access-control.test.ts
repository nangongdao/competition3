import { describe, expect, it } from "vitest";

import { Hono } from "hono";

import type { AppEnv, CloudflareBindings } from "../types";
import { accessControl } from "./access-control";

function createTestApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", accessControl());

  app.get("/api/ping", (c) => c.json({ ok: true }));

  return app;
}

async function request(
  app: Hono<AppEnv>,
  path: string,
  headers: Record<string, string> = {},
  bindings: Partial<CloudflareBindings> = {},
): Promise<Response> {
  return await app.request(path, { headers }, bindings);
}

describe("access control middleware", () => {
  it("allows requests when no token or origin list is configured", async () => {
    const app = createTestApp();
    const response = await request(app, "/api/ping", {
      Origin: "https://evil.example",
    });

    expect(response.status).toBe(200);
  });

  it("rejects requests from origins outside the allowlist", async () => {
    const app = createTestApp();
    const response = await request(
      app,
      "/api/ping",
      { Origin: "https://evil.example" },
      { ALLOWED_ORIGINS: "https://app.example.com" },
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Origin not allowed");
  });

  it("allows requests whose origin matches the allowlist", async () => {
    const app = createTestApp();
    const response = await request(
      app,
      "/api/ping",
      { Origin: "https://app.example.com" },
      { ALLOWED_ORIGINS: "https://app.example.com" },
    );

    expect(response.status).toBe(200);
  });

  it("allows same-origin requests even when not listed", async () => {
    const app = createTestApp();
    const response = await request(
      app,
      "/api/ping",
      {
        Host: "my-worker.workers.dev",
        Origin: "https://my-worker.workers.dev",
      },
      { ALLOWED_ORIGINS: "https://app.example.com" },
    );

    expect(response.status).toBe(200);
  });

  it("allows requests without an Origin header (non-browser clients)", async () => {
    const app = createTestApp();
    const response = await request(
      app,
      "/api/ping",
      {},
      { ALLOWED_ORIGINS: "https://app.example.com" },
    );

    expect(response.status).toBe(200);
  });

  it("rejects requests with a missing client token", async () => {
    const app = createTestApp();
    const response = await request(app, "/api/ping", {}, {
      CLIENT_ACCESS_TOKEN: "s3cret",
    });

    expect(response.status).toBe(401);
  });

  it("rejects requests with a wrong client token", async () => {
    const app = createTestApp();
    const response = await request(
      app,
      "/api/ping",
      { "X-Client-Token": "wrong" },
      { CLIENT_ACCESS_TOKEN: "s3cret" },
    );

    expect(response.status).toBe(401);
  });

  it("allows requests with a matching client token", async () => {
    const app = createTestApp();
    const response = await request(
      app,
      "/api/ping",
      { "X-Client-Token": "s3cret" },
      { CLIENT_ACCESS_TOKEN: "s3cret" },
    );

    expect(response.status).toBe(200);
  });
});
