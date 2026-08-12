import { Hono } from "hono";
import type { Context } from "hono";

import {
  executeUpstreamRequest,
  UpstreamRequestError,
} from "../../lib/upstream/resilience";
import { readJsonResponseBounded } from "../../lib/upstream/response";
import type { AppEnv } from "../../types";
import {
  speechTranscriptionLanguageSchema,
  type SpeechApiErrorCode,
  type SpeechApiErrorResponse,
  type SpeechTranscriptionLanguage,
  type SpeechTranscriptionSuccessResponse,
} from "./types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TRANSCRIPTIONS_PATH = "/audio/transcriptions";
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";
const MAX_AUDIO_UPLOAD_BYTES = 10_000_000;
const TRANSCRIPTION_UPSTREAM_TIMEOUT_MS = 45_000;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

type TranscriptionProviderConfig = {
  transcriptionsUrl: string;
  model: string;
  language: SpeechTranscriptionLanguage;
};

type TranscriptionInput = {
  audioFile: File;
  language: SpeechTranscriptionLanguage;
};

export const speechRoutes = new Hono<AppEnv>();

speechRoutes.post("/transcription", async (c) => {
  const apiKey = resolveTranscriptionApiKey(c.env);

  if (!apiKey) {
    return c.json(
      createErrorResponse(
        "OPENAI_TRANSCRIPTION_API_KEY or OPENAI_API_KEY is not configured for this Worker.",
        "missing_openai_api_key",
      ),
      503,
    );
  }

  const providerConfig = resolveTranscriptionProviderConfig(c.env);

  if (providerConfig === null) {
    return c.json(
      createErrorResponse(
        "Transcription provider URL configuration is invalid.",
        "invalid_transcription_provider_config",
      ),
      503,
    );
  }

  const inputResult = await readTranscriptionInput(c);

  if (inputResult.success === false) {
    return c.json(inputResult.errorResponse, inputResult.status);
  }

  const transcriptionLanguage =
    inputResult.input.language ?? providerConfig.language;
  let upstreamResponse: Response;

  try {
    upstreamResponse = await executeUpstreamRequest({
      env: c.env,
      operation: "transcription",
      url: providerConfig.transcriptionsUrl,
      requestId: c.get("requestId"),
      requestSignal: c.req.raw.signal,
      policy: {
        timeoutMs: TRANSCRIPTION_UPSTREAM_TIMEOUT_MS,
        maxAttempts: 2,
      },
      buildRequestInit: (idempotencyKey): RequestInit => {
        const formData = new FormData();
        formData.set("model", providerConfig.model);
        formData.set("response_format", "json");
        formData.set(
          "file",
          inputResult.input.audioFile,
          getUploadFileName(inputResult.input.audioFile),
        );

        if (transcriptionLanguage !== undefined) {
          formData.set("language", transcriptionLanguage);
        }

        return {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Idempotency-Key": idempotencyKey,
            "X-Request-Id": c.get("requestId"),
          },
          body: formData,
        };
      },
    });
  } catch (error: unknown) {
    return createUpstreamFailureResponse(c, error);
  }

  if (!upstreamResponse.ok) {
    return c.json(
      createErrorResponse(
        "Transcription provider rejected the request.",
        "transcription_failed",
      ),
      502,
    );
  }

  const upstreamBody = await readJsonResponseBounded(upstreamResponse);

  const text = getTranscriptionText(upstreamBody.value);

  if (text === null) {
    return c.json(
      createErrorResponse(
        "Transcription provider response did not include text.",
        "invalid_transcription_response",
      ),
      502,
    );
  }

  const response: SpeechTranscriptionSuccessResponse = {
    success: true,
    text,
    model: getResponseModel(upstreamBody.value) ?? providerConfig.model,
  };

  return c.json(response);
});

function createErrorResponse(
  error: string,
  code: SpeechApiErrorCode,
): SpeechApiErrorResponse {
  return {
    success: false,
    error,
    code,
  };
}

function resolveTranscriptionApiKey(
  env: AppEnv["Bindings"],
): string | undefined {
  return (
    normalizeOptionalSecret(env.OPENAI_TRANSCRIPTION_API_KEY) ??
    normalizeOptionalSecret(env.OPENAI_API_KEY)
  );
}

function normalizeOptionalSecret(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue !== undefined && trimmedValue.length > 0
    ? trimmedValue
    : undefined;
}

function resolveTranscriptionProviderConfig(
  env: AppEnv["Bindings"],
): TranscriptionProviderConfig | null {
  const configuredTranscriptionsUrl = normalizeOptionalUrl(
    env.OPENAI_TRANSCRIPTIONS_URL,
  );

  if (
    configuredTranscriptionsUrl.provided === true &&
    configuredTranscriptionsUrl.url === null
  ) {
    return null;
  }

  let transcriptionsUrl = configuredTranscriptionsUrl.url;

  if (transcriptionsUrl === null) {
    const baseUrl = normalizeUrl(
      env.OPENAI_TRANSCRIPTION_BASE_URL ??
        env.OPENAI_BASE_URL ??
        DEFAULT_OPENAI_BASE_URL,
    );

    if (baseUrl === null) {
      return null;
    }

    transcriptionsUrl = buildUrl(
      baseUrl,
      env.OPENAI_TRANSCRIPTIONS_PATH ?? DEFAULT_TRANSCRIPTIONS_PATH,
    );
  }

  if (transcriptionsUrl === null) {
    return null;
  }

  const languageParseResult = speechTranscriptionLanguageSchema.safeParse(
    env.OPENAI_TRANSCRIPTION_LANGUAGE,
  );

  return {
    transcriptionsUrl,
    model:
      env.OPENAI_TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
    language:
      languageParseResult.success === true
        ? languageParseResult.data
        : undefined,
  };
}

function normalizeOptionalUrl(value: string | undefined): {
  provided: boolean;
  url: string | null;
} {
  const trimmedValue = value?.trim();

  if (trimmedValue === undefined || trimmedValue.length === 0) {
    return {
      provided: false,
      url: null,
    };
  }

  return {
    provided: true,
    url: normalizeUrl(trimmedValue),
  };
}

function normalizeUrl(value: string | undefined): string | null {
  const trimmedValue = value?.trim();

  if (trimmedValue === undefined || trimmedValue.length === 0) {
    return null;
  }

  try {
    return new URL(trimmedValue).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildUrl(baseUrl: string, path: string): string | null {
  const trimmedPath = path.trim();

  if (trimmedPath.length === 0) {
    return null;
  }

  try {
    return new URL(trimmedPath.replace(/^\/+/, ""), `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

async function readTranscriptionInput(
  c: Context<AppEnv>,
): Promise<
  | { success: true; input: TranscriptionInput }
  | {
      success: false;
      status: 400 | 413;
      errorResponse: SpeechApiErrorResponse;
    }
> {
  // 注：整体请求体的大小上限由 app.ts 中的 bodyLimit 中间件在流层面强制执行，
  // 不依赖客户端 content-length 头（该头可被省略或伪造）。
  const contentType = c.req.header("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return {
      success: false,
      status: 400,
      errorResponse: createErrorResponse(
        "Expected multipart/form-data with an audio file field named audio.",
        "invalid_audio_upload",
      ),
    };
  }

  let formData: FormData;

  try {
    formData = await c.req.formData();
  } catch {
    return {
      success: false,
      status: 400,
      errorResponse: createErrorResponse(
        "Invalid multipart form data.",
        "invalid_audio_upload",
      ),
    };
  }

  const audioValue = formData.get("audio");
  const languageValue = formData.get("language");
  const languageParseResult = speechTranscriptionLanguageSchema.safeParse(
    typeof languageValue === "string" && languageValue.trim().length > 0
      ? languageValue
      : undefined,
  );

  if (languageParseResult.success === false) {
    return {
      success: false,
      status: 400,
      errorResponse: createErrorResponse(
        "Invalid transcription language hint.",
        "invalid_audio_upload",
      ),
    };
  }

  if (!isFileLike(audioValue)) {
    return {
      success: false,
      status: 400,
      errorResponse: createErrorResponse(
        "Missing audio file upload.",
        "invalid_audio_upload",
      ),
    };
  }

  if (audioValue.size <= 0) {
    return {
      success: false,
      status: 400,
      errorResponse: createErrorResponse(
        "Audio upload is empty.",
        "invalid_audio_upload",
      ),
    };
  }

  if (audioValue.size > MAX_AUDIO_UPLOAD_BYTES) {
    return {
      success: false,
      status: 413,
      errorResponse: createErrorResponse(
        "Audio upload is too large.",
        "invalid_audio_upload",
      ),
    };
  }

  if (!isSupportedAudioType(audioValue.type)) {
    return {
      success: false,
      status: 400,
      errorResponse: createErrorResponse(
        "Unsupported audio upload type.",
        "invalid_audio_upload",
      ),
    };
  }

  return {
    success: true,
    input: {
      audioFile: audioValue,
      language: languageParseResult.data,
    },
  };
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function isSupportedAudioType(contentType: string): boolean {
  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase();

  if (
    normalizedContentType === undefined ||
    normalizedContentType.length === 0
  ) {
    return true;
  }

  return SUPPORTED_AUDIO_TYPES.has(normalizedContentType);
}

function getUploadFileName(file: File): string {
  const trimmedName = file.name.trim();

  if (trimmedName.length > 0 && trimmedName !== "blob") {
    return trimmedName;
  }

  return `speech.${getAudioFileExtension(file.type)}`;
}

function getAudioFileExtension(contentType: string): string {
  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase();

  if (normalizedContentType === "audio/mp4" || normalizedContentType === "audio/m4a") {
    return "m4a";
  }

  if (normalizedContentType === "audio/mpeg" || normalizedContentType === "audio/mp3") {
    return "mp3";
  }

  if (normalizedContentType === "audio/ogg") {
    return "ogg";
  }

  if (
    normalizedContentType === "audio/wav" ||
    normalizedContentType === "audio/x-wav"
  ) {
    return "wav";
  }

  return "webm";
}

function createUpstreamFailureResponse(
  c: Context<AppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof UpstreamRequestError)) {
    throw error;
  }

  if (error.retryAfterSeconds !== undefined) {
    c.header("Retry-After", String(error.retryAfterSeconds));
  }

  const errorMap: Record<
    UpstreamRequestError["kind"],
    {
      code: SpeechApiErrorCode;
      message: string;
      status: 408 | 502 | 503 | 504;
    }
  > = {
    cancelled: {
      code: "request_cancelled",
      message: "Transcription request was cancelled.",
      status: 408,
    },
    "circuit-open": {
      code: "transcription_circuit_open",
      message: "Transcription provider is temporarily unavailable.",
      status: 503,
    },
    "rate-limited": {
      code: "transcription_rate_limited",
      message: "Transcription provider is temporarily rate limited.",
      status: 503,
    },
    timeout: {
      code: "transcription_timeout",
      message: "Transcription provider timed out.",
      status: 504,
    },
    unavailable: {
      code: "transcription_unavailable",
      message: "Transcription provider is temporarily unavailable.",
      status: 502,
    },
  };
  const mappedError = errorMap[error.kind];

  return c.json(
    createErrorResponse(mappedError.message, mappedError.code),
    mappedError.status,
  );
}

function getTranscriptionText(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("text" in value)) {
    return null;
  }

  return typeof value.text === "string" && value.text.trim().length > 0
    ? value.text.trim()
    : null;
}

function getResponseModel(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("model" in value)) {
    return null;
  }

  return typeof value.model === "string" && value.model.trim().length > 0
    ? value.model
    : null;
}
