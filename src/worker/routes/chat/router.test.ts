import { afterEach, describe, expect, it, vi } from "vitest";

import app from "../../app";
import { createOpenCircuitNamespace } from "../../test-utils/open-circuit";
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

function extractSseDataPayloads(text: string): string[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const line = block.split(/\r?\n/).find((l) => l.startsWith("data:"));
      return line === undefined ? "" : line.slice(5).trim();
    });
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

  it("fails fast with a stable error when the chat circuit is open", async () => {
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(Response.json({})));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_CHAT_MODEL: "vision-chat-model",
        UPSTREAM_CIRCUIT_BREAKER: createOpenCircuitNamespace(),
      }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(body.code).toBe("chat_completion_circuit_open");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps retry-exhausted provider rate limits to a stable error", async () => {
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(new Response("provider quota details", {
        status: 429,
        headers: { "Retry-After": "0" },
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_CHAT_MODEL: "vision-chat-model",
      }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(body.code).toBe("chat_completion_rate_limited");
    expect(body.error).not.toContain("quota details");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    expect(body.error).toBe("Chat Completions provider rejected the request.");
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
    expect("max_completion_tokens" in upstreamBody).toBe(false);

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

  it("injects sceneContext as cheap text context alongside the latest frame (M4.1)", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "The scene context was preserved." } }],
            model: "provider-vision-model",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "What changed?",
          imageDataUrl: "data:image/jpeg;base64,abc123",
          sceneContext: "此前画面（文字摘要）：\n- 桌面上有一杯咖啡",
        }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );
    const body = await readJson<ChatCompletionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }
    const upstreamBody = readMockRequestJson(firstCall[1]);
    const messages = upstreamBody.messages;
    if (!Array.isArray(messages)) {
      throw new Error("Expected upstream messages to be an array.");
    }

    expect(messages[1]).toMatchObject({
      role: "user",
      content: [
        {
          type: "text",
          text: expect.stringContaining("What changed?"),
        },
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,abc123" },
        },
      ],
    });

    const textPart = (messages[1] as { content: { type: string; text?: string }[] }).content[0];
    expect(textPart?.text).toContain("此前画面（文字摘要）");
    expect(textPart?.text).toContain("桌面上有一杯咖啡");
  });

  it("injects historyContext alongside sceneContext as cheap text context", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
            model: "provider-vision-model",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "继续",
          sceneContext: "此前画面：桌上有一杯咖啡",
          historyContext: "[此前 3 条对话摘要]\nuser: 问题\nassistant: 答复",
        }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );

    expect(response.status).toBe(200);

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }
    const upstreamBody = readMockRequestJson(firstCall[1]);
    const messages = upstreamBody.messages;
    if (!Array.isArray(messages)) {
      throw new Error("Expected upstream messages to be an array.");
    }
    // 未附图片时，content 是纯文本字符串，同时注入 sceneContext + historyContext。
    const textContent = messages[1] as { content: string };
    expect(textContent.content).toContain("此前画面：桌上有一杯咖啡");
    expect(textContent.content).toContain("[此前 3 条对话摘要]");
    expect(textContent.content).toContain("assistant: 答复");
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

  it("can use max_completion_tokens for providers that reject max_tokens", async () => {
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
        body: JSON.stringify({
          message: "hello",
          responseBudget: "detailed",
        }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
        OPENAI_CHAT_TOKEN_LIMIT_PARAMETER: "max_completion_tokens",
      }),
    );
    const body = await readJson<ChatCompletionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.answer).toBe("ok");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.max_completion_tokens).toBe(1600);
    expect("max_tokens" in upstreamBody).toBe(false);
  });

  it("can omit token limits and vision input for text-only providers", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "text-only answer",
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
        }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
        OPENAI_CHAT_TOKEN_LIMIT_PARAMETER: "none",
        OPENAI_CHAT_VISION_INPUT: "disabled",
      }),
    );
    const body = await readJson<ChatCompletionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.answer).toBe("text-only answer");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect("max_tokens" in upstreamBody).toBe(false);
    expect("max_completion_tokens" in upstreamBody).toBe(false);

    const messages = upstreamBody.messages;
    if (!Array.isArray(messages)) {
      throw new Error("Expected upstream messages to be an array.");
    }

    expect(messages[1]).toEqual({
      role: "user",
      content: "What should I notice?",
    });
  });

  it("does not expose non-JSON upstream error text", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response("bad request: unsupported max_tokens", {
          status: 400,
          headers: {
            "Content-Type": "text/plain",
          },
        });
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
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );
    const body = await readJson<ChatApiErrorResponse>(response);

    expect(response.status).toBe(502);
    expect(body.code).toBe("chat_completion_failed");
    expect(body.error).toBe("Chat Completions provider rejected the request.");
    expect(body.error).not.toContain("unsupported max_tokens");
  });

  it("passes through authoritative usage for non-streaming completions", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            model: "provider-vision-model",
            usage: {
              prompt_tokens: 1420,
              completion_tokens: 87,
              total_tokens: 1507,
            },
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "A desk with a laptop.",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "What do you see?" }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );
    const body = await readJson<ChatCompletionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.answer).toBe("A desk with a laptop.");
    expect(body.model).toBe("provider-vision-model");
    expect(body.usage).toEqual({
      promptTokens: 1420,
      completionTokens: 87,
      totalTokens: 1507,
    });
  });

  it("omits usage when the non-streaming upstream response has none", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            model: "provider-vision-model",
            choices: [{ message: { content: "ok" } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );
    const body = await readJson<ChatCompletionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.usage).toBeUndefined();
  });

  it("forwards stream:true to the upstream payload", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello", stream: true }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    const upstreamBody = readMockRequestJson(firstCall[1]);
    expect(upstreamBody.stream).toBe(true);
  });

  it("streams chat deltas as text/event-stream when stream:true", async () => {
    const streamBody =
      'data: {"model":"stream-model","choices":[{"delta":{"content":"Hello "}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
      "data: [DONE]\n\n";
    const fetchMock = vi.fn(
      async (): Promise<Response> =>
        new Response(streamBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/chat/completion",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello", stream: true }),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_CHAT_MODEL: "configured-chat-model",
      }),
    );

    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const text = await response.text();
    const dataPayloads = extractSseDataPayloads(text);

    expect(dataPayloads).toHaveLength(3);
    expect(JSON.parse(dataPayloads[0] ?? "{}") as Record<string, unknown>).toMatchObject({
      success: true,
      delta: "Hello ",
    });
    expect(JSON.parse(dataPayloads[1] ?? "{}") as Record<string, unknown>).toMatchObject({
      success: true,
      delta: "world",
    });
    expect(JSON.parse(dataPayloads[2] ?? "{}") as Record<string, unknown>).toMatchObject({
      success: true,
      done: true,
      model: "stream-model",
    });
  });
});
