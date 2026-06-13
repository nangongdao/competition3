import { afterEach, describe, expect, it, vi } from "vitest";

import app from "../../index";
import type { CloudflareBindings } from "../../types";
import type { ChatApiErrorResponse, ChatCompletionSuccessResponse } from "./types";

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

describe("chat completion route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when OPENAI_API_KEY is missing", async () => {
    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "hello" }),
      },
      createEnv({ OPENAI_CHAT_MODEL: "vision-chat-model" }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("missing_openai_api_key");
  });

  it("returns 503 when OPENAI_CHAT_MODEL is missing", async () => {
    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "hello" }),
      },
      createEnv({ OPENAI_API_KEY: "sk-test" }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("missing_chat_model");
  });

  it("returns 503 for invalid chat provider configuration", async () => {
    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "hello" }),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_CHAT_BASE_URL: "not-a-url",
        OPENAI_CHAT_MODEL: "vision-chat-model",
      }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_chat_provider_config");
  });

  it("returns 400 for invalid request body", async () => {
    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "" }),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_CHAT_MODEL: "vision-chat-model",
      }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_request");
  });

  it("maps upstream provider failures to 502", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            error: {
              message: "model not found",
            },
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "hello" }),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_CHAT_MODEL: "vision-chat-model",
      }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.code).toBe("chat_completion_failed");
    expect(body.error).toBe("model not found");
  });

  it("calls the configured Chat Completions endpoint with text and image content", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            model: "provider-vision-model",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "The frame shows a desk.",
                },
              },
            ],
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
      "/api/chat/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "What should I notice?",
          imageDataUrl: "data:image/jpeg;base64,abc123",
          responseBudget: "brief",
          instructions: "Answer in Chinese.",
        }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_BASE_URL: "https://third-party.example/v1",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );
    const body = await readJson<ChatCompletionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.answer).toBe("The frame shows a desk.");
    expect(body.model).toBe("provider-vision-model");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe(
      "https://third-party.example/v1/chat/completions",
    );

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.model).toBe("configured-chat-model");
    expect(upstreamBody.max_tokens).toBe(300);

    const messages = upstreamBody.messages;
    if (!Array.isArray(messages)) {
      throw new Error("Expected upstream messages to be an array.");
    }

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "system",
    });
    expect(JSON.stringify(messages[0])).toContain("Answer in Chinese.");
    expect(JSON.stringify(messages[0])).toContain("Keep each answer brief");
    expect(messages[1]).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "What should I notice?",
        },
        {
          type: "image_url",
          image_url: {
            url: "data:image/jpeg;base64,abc123",
          },
        },
      ],
    });
  });

  it("allows a full Chat Completions URL override", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "ok",
                },
              },
            ],
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
      "/api/chat/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "hello" }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_COMPLETIONS_URL:
          "https://third-party.example/custom/chat",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );
    const body = await readJson<ChatCompletionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.answer).toBe("ok");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe("https://third-party.example/custom/chat");
  });
});