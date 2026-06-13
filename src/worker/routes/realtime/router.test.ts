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

  it("returns 400 for invalid response budget", async () => {
    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visualContextMode: "manual",
          responseBudget: "unbounded",
        }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<ApiErrorResponse>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_request");
  });

  it("returns 503 for invalid realtime provider configuration", async () => {
    const response = await app.request(
      "/api/realtime/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visualContextMode: "manual" }),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_REALTIME_BASE_URL: "not-a-url",
      }),
    );
    const body = await readJson<ApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_realtime_provider_config");
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
    expect(body.costPolicy.responseBudget).toBe("standard");
    expect(body.costPolicy.maxResponseOutputTokens).toBe(800);
    expect(body.costPolicy.maxSessionSeconds).toBe(600);
    expect(body.costPolicy.frameUpload).toBe("manual-or-interval");
    expect(body.webrtcUrl).toBe(
      "https://api.openai.com/v1/realtime?model=gpt-realtime",
    );

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe("https://api.openai.com/v1/realtime/sessions");

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.turn_detection).toBeUndefined();
    expect(upstreamBody.max_response_output_tokens).toBe(800);
  });

  it("uses a third-party realtime base URL for session and WebRTC endpoints", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            id: "sess_test",
            model: "vendor-realtime-model",
            client_secret: {
              value: "vendor_ephemeral_key",
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
        body: JSON.stringify({ visualContextMode: "manual" }),
      },
      createEnv({
        OPENAI_API_KEY: "vendor-key",
        OPENAI_BASE_URL: "https://third-party.example/v1",
        OPENAI_REALTIME_MODEL: "configured-model",
        OPENAI_REALTIME_VOICE: "configured-voice",
      }),
    );
    const body = await readJson<RealtimeSessionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.webrtcUrl).toBe(
      "https://third-party.example/v1/realtime?model=vendor-realtime-model",
    );

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe(
      "https://third-party.example/v1/realtime/sessions",
    );

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.model).toBe("configured-model");
    expect(upstreamBody.voice).toBe("configured-voice");
  });

  it("allows full realtime endpoint URL overrides", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            id: "sess_test",
            client_secret: {
              value: "vendor_ephemeral_key",
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
        body: JSON.stringify({ visualContextMode: "manual" }),
      },
      createEnv({
        OPENAI_API_KEY: "vendor-key",
        OPENAI_REALTIME_SESSION_URL:
          "https://third-party.example/custom/session",
        OPENAI_REALTIME_WEBRTC_URL: "https://rtc.third-party.example/connect",
        OPENAI_REALTIME_MODEL: "configured-model",
      }),
    );
    const body = await readJson<RealtimeSessionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.webrtcUrl).toBe(
      "https://rtc.third-party.example/connect?model=configured-model",
    );

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe(
      "https://third-party.example/custom/session",
    );
  });

  it("maps brief budget to a short output cap and brevity instruction", async () => {
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
          responseBudget: "brief",
          instructions: "Answer from the live camera context.",
        }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<RealtimeSessionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.costPolicy.responseBudget).toBe("brief");
    expect(body.costPolicy.maxResponseOutputTokens).toBe(300);

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.max_response_output_tokens).toBe(300);
    expect(upstreamBody.instructions).toContain(
      "Answer from the live camera context.",
    );
    expect(upstreamBody.instructions).toContain("Keep each answer brief");
  });

  it("maps detailed budget to the largest output cap", async () => {
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
          responseBudget: "detailed",
        }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<RealtimeSessionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.costPolicy.responseBudget).toBe("detailed");
    expect(body.costPolicy.maxResponseOutputTokens).toBe(1600);

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.max_response_output_tokens).toBe(1600);
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
