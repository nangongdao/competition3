import { afterEach, describe, expect, it, vi } from "vitest";

import app from "../../index";
import type { CloudflareBindings } from "../../types";
import type {
  SpeechApiErrorResponse,
  SpeechTranscriptionSuccessResponse,
} from "./types";

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

function createAudioFormData(
  file: File = new File(["voice"], "voice.webm", { type: "audio/webm" }),
  language?: string,
): FormData {
  const formData = new FormData();
  formData.set("audio", file);

  if (language !== undefined) {
    formData.set("language", language);
  }

  return formData;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function readMockRequestFormData(init: RequestInit | undefined): FormData {
  if (!(init?.body instanceof FormData)) {
    throw new Error("Expected mocked request body to be FormData.");
  }

  return init.body;
}

describe("speech transcription route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when OPENAI_API_KEY is missing", async () => {
    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(),
      },
      createEnv(),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("missing_openai_api_key");
  });

  it("returns 503 for invalid transcription provider configuration", async () => {
    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_TRANSCRIPTION_BASE_URL: "not-a-url",
      }),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_transcription_provider_config");
  });

  it("returns 503 for an invalid full transcriptions URL override", async () => {
    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_TRANSCRIPTIONS_URL: "not-a-url",
      }),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_transcription_provider_config");
  });

  it("returns 400 when the request is not multipart form data", async () => {
    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ audio: "nope" }),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
      }),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_audio_upload");
  });

  it("returns 400 for an empty audio upload", async () => {
    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(
          new File([], "empty.webm", { type: "audio/webm" }),
        ),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
      }),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_audio_upload");
  });

  it("returns 400 for an unsupported upload content type", async () => {
    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(
          new File(["not audio"], "notes.txt", { type: "text/plain" }),
        ),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
      }),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_audio_upload");
  });

  it("maps upstream provider failures to 502", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            error: {
              message: "transcription model not found",
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
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
      }),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.code).toBe("transcription_failed");
    expect(body.error).toBe("transcription model not found");
  });

  it("returns 502 when the provider response has no transcript text", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(JSON.stringify({ text: "" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(),
      },
      createEnv({
        OPENAI_API_KEY: "sk-test",
      }),
    );
    const body = await readJson<SpeechApiErrorResponse>(response);

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_transcription_response");
  });

  it("calls the configured transcription endpoint with uploaded audio", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(
          JSON.stringify({
            text: "  今天看到什么  ",
            model: "provider-transcribe-model",
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
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(undefined, "zh"),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_BASE_URL: "https://third-party.example/v1",
        OPENAI_TRANSCRIPTION_MODEL: "configured-transcribe-model",
      }),
    );
    const body = await readJson<SpeechTranscriptionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.text).toBe("今天看到什么");
    expect(body.model).toBe("provider-transcribe-model");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe(
      "https://third-party.example/v1/audio/transcriptions",
    );
    expect(firstCall[1]?.headers).toEqual({
      Authorization: "Bearer provider-key",
    });

    const upstreamBody = readMockRequestFormData(firstCall[1]);
    expect(upstreamBody.get("model")).toBe("configured-transcribe-model");
    expect(upstreamBody.get("response_format")).toBe("json");
    expect(upstreamBody.get("language")).toBe("zh");
    expect(upstreamBody.get("file")).toBeInstanceOf(File);
  });

  it("allows a full transcriptions URL override", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        void init;

        return new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/speech/transcription",
      {
        method: "POST",
        body: createAudioFormData(),
      },
      createEnv({
        OPENAI_API_KEY: "provider-key",
        OPENAI_BASE_URL: "not-a-url",
        OPENAI_TRANSCRIPTIONS_URL:
          "https://third-party.example/custom/transcribe",
      }),
    );
    const body = await readJson<SpeechTranscriptionSuccessResponse>(response);

    expect(response.status).toBe(200);
    expect(body.text).toBe("ok");

    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error("Expected upstream fetch to be called.");
    }

    expect(String(firstCall[0])).toBe(
      "https://third-party.example/custom/transcribe",
    );
  });
});
