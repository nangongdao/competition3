import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../../types";
import {
  realtimeSessionInputSchema,
  type ApiErrorResponse,
  type RealtimeSessionSuccessResponse,
} from "./types";

const OPENAI_REALTIME_SESSIONS_URL =
  "https://api.openai.com/v1/realtime/sessions";
const DEFAULT_REALTIME_MODEL = "gpt-realtime";
const DEFAULT_REALTIME_VOICE = "alloy";
const MAX_SESSION_SECONDS = 10 * 60;

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

  const sessionPayload = {
    model: c.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
    voice: c.env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE,
    instructions:
      parseResult.data.instructions ??
      "You are a concise visual dialogue assistant. Use camera frames only when the client explicitly supplies sampled visual context.",
  };

  const upstreamResponse = await fetch(OPENAI_REALTIME_SESSIONS_URL, {
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
        `OpenAI session creation failed with status ${upstreamResponse.status}.`,
      code: "openai_session_failed",
    };

    return c.json(response, 502);
  }

  const response: RealtimeSessionSuccessResponse = {
    success: true,
    session: upstreamBody,
    costPolicy: {
      visualContextMode: parseResult.data.visualContextMode,
      maxSessionSeconds: MAX_SESSION_SECONDS,
      frameUpload: "manual-or-interval",
    },
  };

  return c.json(response);
});

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
