import { describe, expect, it } from "vitest";

import app from "../../index";
import type { CloudflareBindings } from "../../types";
import type { ProviderConfigResponse } from "./types";

const mockAssets: Fetcher = {
  fetch: async (): Promise<Response> => new Response("not found", { status: 404 }),
  connect: (): Socket => {
    throw new Error("ASSETS.connect is not used in route tests.");
  },
};

function createEnv(
  overrides: Partial<CloudflareBindings> = {},
): CloudflareBindings {
  return {
    ASSETS: mockAssets,
    ENVIRONMENT: "test",
    ...overrides,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("provider config route", () => {
  it("defaults to chat provider mode", async () => {
    const response = await app.request("/api/provider/config", {}, createEnv());
    const body = await readJson<ProviderConfigResponse>(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      providerMode: "chat",
    });
  });

  it("returns realtime mode when configured", async () => {
    const response = await app.request(
      "/api/provider/config",
      {},
      createEnv({ OPENAI_PROVIDER_MODE: "realtime" }),
    );
    const body = await readJson<ProviderConfigResponse>(response);

    expect(response.status).toBe(200);
    expect(body.providerMode).toBe("realtime");
  });
});