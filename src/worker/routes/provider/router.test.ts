import { describe, expect, it } from "vitest";

import app from "../../app";
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
    expect(body.providerMode).toBe("chat");
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

  it("reports vision capability for the configured chat model", async () => {
    const response = await app.request(
      "/api/provider/config",
      {},
      createEnv({
        OPENAI_CHAT_MODEL: "Qwen/Qwen2.5-VL-72B-Instruct",
      }),
    );
    const body = await readJson<ProviderConfigResponse>(response);

    expect(response.status).toBe(200);
    expect(body.visionCapability).toBe("multi-image");
  });

  it("reports none when the chat model has no vision support", async () => {
    const response = await app.request(
      "/api/provider/config",
      {},
      createEnv({ OPENAI_CHAT_MODEL: "nex-agi/Nex-N2-Pro" }),
    );
    const body = await readJson<ProviderConfigResponse>(response);

    expect(response.status).toBe(200);
    expect(body.visionCapability).toBe("none");
  });

  it("respects an explicit vision mode declaration", async () => {
    const response = await app.request(
      "/api/provider/config",
      {},
      createEnv({
        OPENAI_CHAT_MODEL: "nex-agi/Nex-N2-Pro",
        OPENAI_CHAT_VISION_INPUT: "enabled",
      }),
    );
    const body = await readJson<ProviderConfigResponse>(response);

    expect(response.status).toBe(200);
    expect(body.visionCapability).toBe("multi-image");
  });
});
