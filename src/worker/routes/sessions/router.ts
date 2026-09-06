import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import {
  appendMessage,
  createSession,
  deleteSession,
  getBudgetSettings,
  getMonthUsageDailySeries,
  getMonthUsageTotals,
  getSession,
  getSessionWithMessages,
  getUsageTotals,
  listRecentMonthUsage,
  listSceneMemory,
  listSessions,
  listSessionUsageSummaries,
  listUsageEntries,
  recordUsageEntry,
  renameSession,
  replaceSceneMemory,
  upsertBudgetSettings,
} from "../../lib/db/queries";
import { logWorkerEvent } from "../../lib/logger";
import type { AppEnv } from "../../types";
import {
  appendMessageInputSchema,
  createSessionInputSchema,
  listSessionsQuerySchema,
  recordUsageInputSchema,
  renameSessionInputSchema,
  replaceSceneMemoryInputSchema,
  updateBudgetInputSchema,
  type AppendMessageOutput,
  type BudgetViewOutput,
  type CreateSessionOutput,
  type DeleteSessionOutput,
  type GetSessionOutput,
  type GlobalUsageOutput,
  type ListSceneMemoryOutput,
  type ListSessionsOutput,
  type ListUsageOutput,
  type RenameSessionOutput,
  type ReplaceSceneMemoryOutput,
  type RecordUsageOutput,
  type SessionComparisonOutput,
} from "./types";

export const sessionRoutes = new Hono<AppEnv>();

/**
 * 会话 CRUD 无上游额度成本，仅挂全局 secureHeaders/bodyLimit，
 * 不套 accessControl/rateLimit（与 health/provider 一致）。
 */
sessionRoutes.post("/", async (c) => {
  const db = requireDb(c);

  const rawBody = await readJsonBody(c);
  const parseResult = createSessionInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json<CreateSessionOutput>(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid request body.",
        code: "invalid_request",
      },
      400,
    );
  }

  const session = await createSession(db, {
    id: crypto.randomUUID(),
    title: parseResult.data.title,
    providerMode: parseResult.data.providerMode,
    now: Date.now(),
  });

  return c.json<CreateSessionOutput>({ success: true, session }, 201);
});

sessionRoutes.get("/", async (c) => {
  const db = requireDb(c);
  const queryResult = listSessionsQuerySchema.safeParse(c.req.query());

  if (!queryResult.success) {
    return c.json<ListSessionsOutput>(
      {
        success: false,
        error: queryResult.error.issues[0]?.message ?? "Invalid query.",
        code: "invalid_query",
      },
      400,
    );
  }

  const sessions = await listSessions(db, queryResult.data.limit, queryResult.data.offset);

  return c.json<ListSessionsOutput>({
    success: true,
    sessions,
    total: sessions.length,
    limit: queryResult.data.limit,
    offset: queryResult.data.offset,
  });
});

sessionRoutes.get("/:id", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const session = await getSessionWithMessages(db, id);

  if (session === null) {
    return c.json<GetSessionOutput>(
      { success: false, error: "Session not found.", code: "session_not_found" },
      404,
    );
  }

  return c.json<GetSessionOutput>({ success: true, session });
});

sessionRoutes.patch("/:id", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const rawBody = await readJsonBody(c);
  const parseResult = renameSessionInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json<RenameSessionOutput>(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid request body.",
        code: "invalid_request",
      },
      400,
    );
  }

  const exists = await getSession(db, id);

  if (exists === null) {
    return c.json<RenameSessionOutput>(
      { success: false, error: "Session not found.", code: "session_not_found" },
      404,
    );
  }

  await renameSession(db, id, parseResult.data.title, Date.now());
  const updated = await getSession(db, id);

  if (updated === null) {
    throw new HTTPException(500, { message: "Failed to reload session." });
  }

  return c.json<RenameSessionOutput>({ success: true, session: updated });
});

sessionRoutes.delete("/:id", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const deleted = await deleteSession(db, id);

  if (!deleted) {
    return c.json<DeleteSessionOutput>(
      { success: false, error: "Session not found.", code: "session_not_found" },
      404,
    );
  }

  return c.json<DeleteSessionOutput>({ success: true, deleted: true });
});

sessionRoutes.post("/:id/messages", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const rawBody = await readJsonBody(c);
  const parseResult = appendMessageInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json<AppendMessageOutput>(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid request body.",
        code: "invalid_request",
      },
      400,
    );
  }

  try {
    const message = await appendMessage(db, {
      id: crypto.randomUUID(),
      sessionId: id,
      role: parseResult.data.role,
      content: parseResult.data.content,
      modality: parseResult.data.modality,
      tokens: parseResult.data.tokens ?? null,
      now: Date.now(),
    });

    return c.json<AppendMessageOutput>({ success: true, message }, 201);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return c.json<AppendMessageOutput>(
        { success: false, error: "Session not found.", code: "session_not_found" },
        404,
      );
    }

    throw error;
  }
});

// M4.1 场景记忆：读取某会话的关键帧文字摘要。
sessionRoutes.get("/:id/scene-memory", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const session = await getSession(db, id);

  if (session === null) {
    return c.json<ListSceneMemoryOutput>(
      { success: false, error: "Session not found.", code: "session_not_found" },
      404,
    );
  }

  const entries = await listSceneMemory(db, id);

  return c.json<ListSceneMemoryOutput>({ success: true, entries });
});

// M4.1 场景记忆：覆盖保存某会话的场景记忆（先删后插）。
sessionRoutes.put("/:id/scene-memory", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const rawBody = await readJsonBody(c);
  const parseResult = replaceSceneMemoryInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json<ReplaceSceneMemoryOutput>(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid request body.",
        code: "invalid_request",
      },
      400,
    );
  }

  try {
    const now = Date.now();
    const normalizedEntries = parseResult.data.entries.map((entry) => ({
      entryId: entry.entryId,
      summary: entry.summary,
      frameTokens: entry.frameTokens ?? null,
      recordedAt: entry.recordedAt ?? now,
    }));
    const saved = await replaceSceneMemory(db, id, normalizedEntries);

    return c.json<ReplaceSceneMemoryOutput>({
      success: true,
      saved,
      entries: normalizedEntries.map((entry) => ({
        id: "",
        sessionId: id,
        entryId: entry.entryId,
        summary: entry.summary,
        frameTokens: entry.frameTokens,
        recordedAt: entry.recordedAt,
      })),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return c.json<ReplaceSceneMemoryOutput>(
        { success: false, error: "Session not found.", code: "session_not_found" },
        404,
      );
    }

    throw error;
  }
});

// 会话级用量持久化：读取某会话的用量记录 + 累计汇总。
sessionRoutes.get("/:id/usage", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const session = await getSession(db, id);

  if (session === null) {
    return c.json<ListUsageOutput>(
      { success: false, error: "Session not found.", code: "session_not_found" },
      404,
    );
  }

  const entries = await listUsageEntries(db, id);
  const totals = await getUsageTotals(db, id);

  return c.json<ListUsageOutput>({ success: true, entries, totals });
});

// 会话级用量持久化：记录一轮 Chat / Realtime token 用量。
sessionRoutes.post("/:id/usage", async (c) => {
  const db = requireDb(c);
  const id = c.req.param("id");
  const rawBody = await readJsonBody(c);
  const parseResult = recordUsageInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json<RecordUsageOutput>(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid request body.",
        code: "invalid_request",
      },
      400,
    );
  }

  const input = parseResult.data;
  const entry = await recordUsageEntry(db, {
    id: crypto.randomUUID(),
    sessionId: id,
    mode: input.mode,
    inputTokens: input.inputTokens,
    inputTextTokens: input.inputTextTokens,
    inputAudioTokens: input.inputAudioTokens,
    inputImageTokens: input.inputImageTokens,
    cachedInputTokens: input.cachedInputTokens,
    cachedTextTokens: input.cachedTextTokens,
    cachedAudioTokens: input.cachedAudioTokens,
    cachedImageTokens: input.cachedImageTokens,
    outputTokens: input.outputTokens,
    outputTextTokens: input.outputTextTokens,
    outputAudioTokens: input.outputAudioTokens,
    estimatedCostUsd: input.estimatedCostUsd,
    now: input.recordedAt ?? Date.now(),
  });

  if (entry === null) {
    return c.json<RecordUsageOutput>(
      { success: false, error: "Session not found.", code: "session_not_found" },
      404,
    );
  }

  return c.json<RecordUsageOutput>({ success: true, entry }, 201);
});

// 全局用量累计：跨所有会话聚合，供“累计用量”视图使用。
sessionRoutes.get("/usage/totals", async (c) => {
  const db = requireDb(c);
  const totals = await getUsageTotals(db, null);

  return c.json<GlobalUsageOutput>({ success: true, totals });
});

// ① 全局预算护栏：读取预算配置 + 当月用量 + 逐日消费序列 + 使用率。
sessionRoutes.get("/usage/budget", async (c) => {
  const db = requireDb(c);
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [budget, month, monthSeries, monthHistory] = await Promise.all([
    getBudgetSettings(db),
    getMonthUsageTotals(db, monthKey),
    getMonthUsageDailySeries(db, monthKey),
    listRecentMonthUsage(db, 6),
  ]);
  const usedPct =
    budget.monthlyBudgetUsd > 0
      ? (month.estimatedCostUsd / budget.monthlyBudgetUsd) * 100
      : 0;

  return c.json<BudgetViewOutput>({
    success: true,
    budget,
    month,
    monthSeries,
    monthHistory,
    usedPct,
  });
});

// ① 全局预算护栏：覆盖保存预算配置。
sessionRoutes.put("/usage/budget", async (c) => {
  const db = requireDb(c);
  const rawBody = await readJsonBody(c);
  const parseResult = updateBudgetInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json<BudgetViewOutput>(
      {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid request body.",
        code: "invalid_request",
      },
      400,
    );
  }

  const budget = await upsertBudgetSettings(db, {
    monthlyBudgetUsd: parseResult.data.monthlyBudgetUsd,
    alertThresholdPct: parseResult.data.alertThresholdPct,
    now: Date.now(),
  });
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [month, monthSeries, monthHistory] = await Promise.all([
    getMonthUsageTotals(db, monthKey),
    getMonthUsageDailySeries(db, monthKey),
    listRecentMonthUsage(db, 6),
  ]);
  const usedPct =
    budget.monthlyBudgetUsd > 0
      ? (month.estimatedCostUsd / budget.monthlyBudgetUsd) * 100
      : 0;

  return c.json<BudgetViewOutput>({
    success: true,
    budget,
    month,
    monthSeries,
    monthHistory,
    usedPct,
  });
});

// ③ 跨会话成本对比：按会话聚合的用量汇总（按估算成本降序）。
sessionRoutes.get("/usage/by-session", async (c) => {
  const db = requireDb(c);
  const sessions = await listSessionUsageSummaries(db, 50);

  return c.json<SessionComparisonOutput>({
    success: true,
    sessions,
    total: sessions.length,
  });
});

function requireDb(c: Context<AppEnv>): D1Database {
  const db = c.env.SESSIONS_DB;

  if (db === undefined) {
    logWorkerEvent("warn", "sessions_db_unbound", {
      requestId: c.get("requestId"),
    });
    throw new HTTPException(503, { message: "Session storage is not configured." });
  }

  return db;
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
