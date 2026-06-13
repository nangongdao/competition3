import { afterEach, describe, expect, it, vi } from "vitest";

import app from "../../index";
import type {
  ApiErrorResponse,
  RealtimeSessionSuccessResponse,
} from "./types";
import type { CloudflareBindings } from "../../types";

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

function readMockRequestJson(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") {
    throw new Error("Expected mocked request body to be a JSON string.");
  }

  const value = JSON.parse(init.body) as unknown;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected mocked request body to be a JSON object.");
  }

  return value as Record<string, unknown>;
}

describe("realtime session route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when OPENAI_API_KEY is missing", async () => {
    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visualContextMode: "manual" }),
      },
      createEnv(),
    );
    const body = await readJson<ApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("missing_openai_api_key");
  });

  it("returns 400 for invalid visual context mode", async () => {
    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visualContextMode: "continuous" }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<ApiErrorResponse>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_request");
  });

  it("returns 400 for invalid turn detection mode", async () => {
    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualContextMode: "manual",
          turnDetectionMode: "continuous",
        }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<ApiErrorResponse>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_request");
  });

  it("maps upstream OpenAI failures to 502", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            error: {
              message: "upstream rejected request",
            },
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visualContextMode: "manual" }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<ApiErrorResponse>(response);

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.code).toBe("openai_session_failed");
    expect(body.error).toBe("upstream rejected request");
  });

  it("returns short-lived session data with cost policy", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            id: "sess_test",
            model: "gpt-realtime",
            client_secret: {
              value: "ek_test",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visualContextMode: "interval" }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<RealtimeSessionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.costPolicy.visualContextMode).toBe("interval");
    expect(body.costPolicy.turnDetectionMode).toBe("server-vad");
    expect(body.costPolicy.maxSessionSeconds).toBe(600);
    expect(body.costPolicy.frameUpload).toBe("manual-or-interval");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe("https://api.openai.com/v1/realtime/sessions");

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.turn_detection).toBeUndefined();
  });

  it("maps push-to-talk mode to disabled upstream turn detection", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            id: "sess_test",
            model: "gpt-realtime",
            client_secret: {
              value: "ek_test",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualContextMode: "manual",
          turnDetectionMode: "push-to-talk",
        }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<RealtimeSessionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.costPolicy.turnDetectionMode).toBe("push-to-talk");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.turn_detection).toBeNull();
  });
});
