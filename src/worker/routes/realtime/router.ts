import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../../types";
import {
  realtimeSessionInputSchema,
  type ApiErrorResponse,
  type RealtimeResponseBudget,
  type RealtimeSessionSuccessResponse,
} from "./types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_REALTIME_SESSION_PATH = "/realtime/sessions";
const DEFAULT_REALTIME_WEBRTC_PATH = "/realtime";
const DEFAULT_REALTIME_MODEL = "gpt-realtime";
const DEFAULT_REALTIME_VOICE = "alloy";
const MAX_SESSION_SECONDS = 10 * 60;
const DEFAULT_REALTIME_INSTRUCTIONS =
  "You are a concise visual dialogue assistant. Use camera frames only when the client explicitly supplies sampled visual context.";
const BRIEF_RESPONSE_INSTRUCTION =
  "Keep each answer brief: use one or two short sentences unless the user explicitly asks for detail.";
const RESPONSE_BUDGET_OUTPUT_TOKENS: Record<RealtimeResponseBudget, number> = {
  brief: 300,
  standard: 800,
  detailed: 1600,
};

type RealtimeSessionPayload = {
  model: string;
  voice: string;
  instructions: string;
  max_response_output_tokens: number;
  turn_detection?: null;
};

type RealtimeProviderConfig = {
  sessionUrl: string;
  webrtcUrl: string;
  model: string;
  voice: string;
};

export const realtimeRoutes = new Hono<AppEnv>();

realtimeRoutes.post("/session", async (c) => {
  const apiKey = c.env.OPENAI_API_KEY;

  if (!apiKey) {
    const response: ApiErrorResponse = {
      success: false,
      error: "OPENAI_API_KEY is not configured for this Worker.",
      code: "missing_openai_api_key",
    };

    return c.json(response, 503);
  }

  const providerConfig = resolveRealtimeProviderConfig(c.env);

  if (providerConfig === null) {
    const response: ApiErrorResponse = {
      success: false,
      error: "Realtime provider URL configuration is invalid.",
      code: "invalid_realtime_provider_config",
    };

    return c.json(response, 503);
  }

  const rawBody = await readJsonBody(c);
  const parseResult = realtimeSessionInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    const response: ApiErrorResponse = {
      success: false,
      error: parseResult.error.issues[0]?.message ?? "Invalid request body.",
      code: "invalid_request",
    };

    return c.json(response, 400);
  }

  const sessionInput = parseResult.data;
  const maxResponseOutputTokens =
    RESPONSE_BUDGET_OUTPUT_TOKENS[sessionInput.responseBudget];
  const sessionPayload: RealtimeSessionPayload = {
    model: providerConfig.model,
    voice: providerConfig.voice,
    instructions: buildSessionInstructions(
      sessionInput.instructions,
      sessionInput.responseBudget,
    ),
    max_response_output_tokens: maxResponseOutputTokens,
  };

  if (sessionInput.turnDetectionMode === "push-to-talk") {
    sessionPayload.turn_detection = null;
  }

  const upstreamResponse = await fetch(providerConfig.sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sessionPayload),
  });

  const upstreamBody = await readUpstreamJson(upstreamResponse);

  if (!upstreamResponse.ok) {
    const response: ApiErrorResponse = {
      success: false,
      error:
        getUpstreamErrorMessage(upstreamBody) ??
        `Realtime provider session creation failed with status ${upstreamResponse.status}.`,
      code: "openai_session_failed",
    };

    return c.json(response, 502);
  }

  const response: RealtimeSessionSuccessResponse = {
    success: true,
    session: upstreamBody,
    webrtcUrl: appendQueryParam(
      providerConfig.webrtcUrl,
      "model",
      getSessionModel(upstreamBody) ?? providerConfig.model,
    ),
    costPolicy: {
      visualContextMode: sessionInput.visualContextMode,
      turnDetectionMode: sessionInput.turnDetectionMode,
      responseBudget: sessionInput.responseBudget,
      maxResponseOutputTokens,
      maxSessionSeconds: MAX_SESSION_SECONDS,
      frameUpload: "manual-or-interval",
    },
  };

  return c.json(response);
});

function resolveRealtimeProviderConfig(
  env: AppEnv["Bindings"],
): RealtimeProviderConfig | null {
  const realtimeBaseUrl = normalizeUrl(
    env.OPENAI_REALTIME_BASE_URL ?? env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL,
  );

  if (realtimeBaseUrl === null) {
    return null;
  }

  const sessionUrl =
    normalizeUrl(env.OPENAI_REALTIME_SESSION_URL) ??
    buildUrl(
      realtimeBaseUrl,
      env.OPENAI_REALTIME_SESSION_PATH ?? DEFAULT_REALTIME_SESSION_PATH,
    );
  const webrtcUrl =
    normalizeUrl(env.OPENAI_REALTIME_WEBRTC_URL) ??
    buildUrl(
      realtimeBaseUrl,
      env.OPENAI_REALTIME_WEBRTC_PATH ?? DEFAULT_REALTIME_WEBRTC_PATH,
    );

  if (sessionUrl === null || webrtcUrl === null) {
    return null;
  }

  return {
    sessionUrl,
    webrtcUrl,
    model: env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
    voice: env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE,
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

function appendQueryParam(url: string, key: string, value: string): string {
  const targetUrl = new URL(url);
  targetUrl.searchParams.set(key, value);

  return targetUrl.toString();
}

function getSessionModel(session: unknown): string | null {
  if (typeof session !== "object" || session === null || !("model" in session)) {
    return null;
  }

  const model = session.model;

  return typeof model === "string" && model.trim().length > 0 ? model : null;
}

function buildSessionInstructions(
  instructions: string | undefined,
  responseBudget: RealtimeResponseBudget,
): string {
  const baseInstructions = instructions ?? DEFAULT_REALTIME_INSTRUCTIONS;

  if (responseBudget !== "brief") {
    return baseInstructions;
  }

  return `${baseInstructions}\n${BRIEF_RESPONSE_INSTRUCTION}`;
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  const contentType = c.req.header("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body." });
  }
}

async function readUpstreamJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getUpstreamErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  if ("error" in value) {
    const errorValue = value.error;

    if (
      typeof errorValue === "object" &&
      errorValue !== null &&
      "message" in errorValue &&
      typeof errorValue.message === "string"
    ) {
      return errorValue.message;
    }
  }

  if ("message" in value && typeof value.message === "string") {
    return value.message;
  }

  return undefined;
}
