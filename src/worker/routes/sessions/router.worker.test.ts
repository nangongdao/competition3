import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../app";
import type { CloudflareBindings } from "../../types";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL DEFAULT '新会话',
    provider_mode TEXT NOT NULL DEFAULT 'chat',
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    modality   TEXT NOT NULL DEFAULT 'text',
    tokens     INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS frames (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id   TEXT REFERENCES messages(id) ON DELETE CASCADE,
    data_url_ref TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_frames_session ON frames(session_id)`,
  `CREATE TABLE IF NOT EXISTS scene_memory (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    entry_id     TEXT NOT NULL,
    summary      TEXT NOT NULL,
    frame_tokens INTEGER,
    recorded_at  INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scene_memory_session ON scene_memory(session_id, recorded_at)`,
  `CREATE TABLE IF NOT EXISTS usage_entries (
    id                   TEXT PRIMARY KEY,
    session_id           TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    mode                 TEXT NOT NULL DEFAULT 'chat',
    input_tokens         INTEGER NOT NULL DEFAULT 0,
    input_text_tokens    INTEGER NOT NULL DEFAULT 0,
    input_audio_tokens   INTEGER NOT NULL DEFAULT 0,
    input_image_tokens   INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens  INTEGER NOT NULL DEFAULT 0,
    cached_text_tokens   INTEGER NOT NULL DEFAULT 0,
    cached_audio_tokens  INTEGER NOT NULL DEFAULT 0,
    cached_image_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens        INTEGER NOT NULL DEFAULT 0,
    output_text_tokens   INTEGER NOT NULL DEFAULT 0,
    output_audio_tokens  INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd   REAL NOT NULL DEFAULT 0,
    recorded_at          INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_usage_entries_session ON usage_entries(session_id, recorded_at)`,
  `CREATE TABLE IF NOT EXISTS budget_settings (
    id                   TEXT PRIMARY KEY,
    monthly_budget_usd    REAL NOT NULL DEFAULT 0,
    alert_threshold_pct   REAL NOT NULL DEFAULT 80,
    updated_at            INTEGER NOT NULL
  )`,
];

const mockAssets: Fetcher = {
  fetch: async (): Promise<Response> => new Response("not found", { status: 404 }),
  connect: (): Socket => {
    throw new Error("ASSETS.connect is not used in route tests.");
  },
};

function createEnv(): CloudflareBindings {
  return {
    ASSETS: mockAssets,
    ENVIRONMENT: "test",
    SESSIONS_DB: env.SESSIONS_DB,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createSessionRequest(env_: CloudflareBindings, title?: string) {
  return app.request(
    "/api/sessions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        title === undefined ? {} : { title },
      ),
    },
    env_,
  );
}

describe("sessions route", () => {
  beforeAll(async () => {
    // 手动应用 schema（幂等），保证测试环境的 D1 表存在
    const db = env.SESSIONS_DB;
    await db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)));
  });

  beforeEach(async () => {
    // 清空会话表，保证测试隔离
    const db = env.SESSIONS_DB;
    await db.batch([
      db.prepare(`DELETE FROM budget_settings`),
      db.prepare(`DELETE FROM usage_entries`),
      db.prepare(`DELETE FROM scene_memory`),
      db.prepare(`DELETE FROM frames`),
      db.prepare(`DELETE FROM messages`),
      db.prepare(`DELETE FROM sessions`),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 when SESSIONS_DB is unbound", async () => {
    const response = await app.request(
      "/api/sessions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      { ...createEnv(), SESSIONS_DB: undefined },
    );
    const body = await readJson<{ success: boolean; error: string }>(response);

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toContain("not configured");
  });

  it("creates a session with defaults", async () => {
    const env_ = createEnv();
    const response = await createSessionRequest(env_);
    const body = await readJson<{ success: boolean; session: { title: string; providerMode: string; messageCount: number } }>(response);

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.session.title).toBe("新会话");
    expect(body.session.providerMode).toBe("chat");
    expect(body.session.messageCount).toBe(0);
  });

  it("creates a session with custom title and provider mode", async () => {
    const env_ = createEnv();
    const response = await app.request(
      "/api/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "我的会话", providerMode: "realtime" }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; session: { title: string; providerMode: string } }>(response);

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.session.title).toBe("我的会话");
    expect(body.session.providerMode).toBe("realtime");
  });

  it("rejects invalid provider mode", async () => {
    const env_ = createEnv();
    const response = await app.request(
      "/api/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerMode: "invalid-mode" }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; code: string }>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_request");
  });

  it("lists sessions ordered by updated_at desc", async () => {
    const env_ = createEnv();
    const first = await readJson<{ success: boolean; session: { id: string } }>(
      await createSessionRequest(env_, "first"),
    );
    // 稍等以区分 created_at，再建第二个
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await readJson<{ success: boolean; session: { id: string } }>(
      await createSessionRequest(env_, "second"),
    );

    const response = await app.request("/api/sessions", {}, env_);
    const body = await readJson<{ success: boolean; sessions: { id: string; title: string }[]; total: number }>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sessions.length).toBe(2);
    expect(body.sessions[0]?.id).toBe(second.session.id);
    expect(body.sessions[1]?.id).toBe(first.session.id);
  });

  it("gets a session with messages", async () => {
    const env_ = createEnv();
    const created = await readJson<{ success: boolean; session: { id: string } }>(
      await createSessionRequest(env_),
    );
    const sessionId = created.session.id;

    // 追加两条消息
    await app.request(
      `/api/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: "你好" }),
      },
      env_,
    );
    await app.request(
      `/api/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: "你好！", tokens: 12 }),
      },
      env_,
    );

    const response = await app.request(`/api/sessions/${sessionId}`, {}, env_);
    const body = await readJson<{ success: boolean; session: { messages: { role: string; content: string; tokens: number | null }[]; messageCount: number } }>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.session.messages.length).toBe(2);
    expect(body.session.messages[0]?.role).toBe("user");
    expect(body.session.messages[0]?.content).toBe("你好");
    expect(body.session.messages[1]?.role).toBe("assistant");
    expect(body.session.messages[1]?.tokens).toBe(12);
    expect(body.session.messageCount).toBe(2);
  });

  it("returns 404 for a missing session", async () => {
    const env_ = createEnv();
    const response = await app.request(
      "/api/sessions/does-not-exist",
      {},
      env_,
    );
    const body = await readJson<{ success: boolean; code: string }>(response);

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("session_not_found");
  });

  it("renames a session", async () => {
    const env_ = createEnv();
    const created = await readJson<{ success: boolean; session: { id: string } }>(
      await createSessionRequest(env_, "旧标题"),
    );
    const sessionId = created.session.id;

    const response = await app.request(
      `/api/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新标题" }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; session: { title: string } }>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.session.title).toBe("新标题");
  });

  it("deletes a session and its cascade messages", async () => {
    const env_ = createEnv();
    const created = await readJson<{ success: boolean; session: { id: string } }>(
      await createSessionRequest(env_),
    );
    const sessionId = created.session.id;

    await app.request(
      `/api/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: "会被级联删除" }),
      },
      env_,
    );

    const deleteResponse = await app.request(
      `/api/sessions/${sessionId}`,
      { method: "DELETE" },
      env_,
    );
    expect(deleteResponse.status).toBe(200);

    const getResponse = await app.request(`/api/sessions/${sessionId}`, {}, env_);
    expect(getResponse.status).toBe(404);

    const db = env.SESSIONS_DB;
    const messageCount = await db
      .prepare(`SELECT COUNT(*) AS count FROM messages`)
      .first<{ count: number }>();
    expect(Number(messageCount?.count)).toBe(0);
  });

  it("appends a message and bumps session updated_at", async () => {
    const env_ = createEnv();
    const created = await readJson<{ success: boolean; session: { id: string } }>(
      await createSessionRequest(env_),
    );
    const sessionId = created.session.id;

    const response = await app.request(
      `/api/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: "追加消息", modality: "text" }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; message: { role: string; content: string; modality: string } }>(response);

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.message.role).toBe("user");
    expect(body.message.content).toBe("追加消息");
    expect(body.message.modality).toBe("text");
  });

  it("returns 404 when appending to a missing session", async () => {
    const env_ = createEnv();
    const response = await app.request(
      "/api/sessions/missing/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: "hello" }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; code: string }>(response);

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe("session_not_found");
  });
});

describe("sessions route — scene memory", () => {
  it("returns empty entries for a fresh session", async () => {
    const env_ = createEnv();
    const created = await createSessionRequest(env_, "scene");
    const createdBody = await readJson<{
      success: boolean;
      session: { id: string };
    }>(created);

    const response = await app.request(
      `/api/sessions/${createdBody.session.id}/scene-memory`,
      { method: "GET" },
      env_,
    );
    const body = await readJson<{ success: boolean; entries: unknown[] }>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.entries).toEqual([]);
  });

  it("saves and reads back scene memory entries", async () => {
    const env_ = createEnv();
    const created = await createSessionRequest(env_, "scene");
    const createdBody = await readJson<{
      success: boolean;
      session: { id: string };
    }>(created);
    const sessionId = createdBody.session.id;

    const putResponse = await app.request(
      `/api/sessions/${sessionId}/scene-memory`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              entryId: "frame-0",
              summary: "桌上有一杯咖啡",
              frameTokens: 425,
              recordedAt: 111,
            },
            {
              entryId: "frame-1",
              summary: "用户拿起手机",
              frameTokens: 425,
              recordedAt: 222,
            },
          ],
        }),
      },
      env_,
    );
    const putBody = await readJson<{
      success: boolean;
      saved: number;
      entries: { entryId: string; summary: string; frameTokens: number | null }[];
    }>(putResponse);

    expect(putResponse.status).toBe(200);
    expect(putBody.success).toBe(true);
    expect(putBody.saved).toBe(2);

    const getResponse = await app.request(
      `/api/sessions/${sessionId}/scene-memory`,
      { method: "GET" },
      env_,
    );
    const getBody = await readJson<{
      success: boolean;
      entries: { entryId: string; summary: string; frameTokens: number | null }[];
    }>(getResponse);

    expect(getBody.success).toBe(true);
    expect(getBody.entries.map((e) => e.summary)).toEqual([
      "桌上有一杯咖啡",
      "用户拿起手机",
    ]);
    expect(getBody.entries.map((e) => e.frameTokens)).toEqual([425, 425]);
  });

  it("rejects invalid scene memory payload", async () => {
    const env_ = createEnv();
    const created = await createSessionRequest(env_, "scene");
    const createdBody = await readJson<{
      success: boolean;
      session: { id: string };
    }>(created);

    const response = await app.request(
      `/api/sessions/${createdBody.session.id}/scene-memory`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ entryId: "", summary: "bad" }] }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; code: string }>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid_request");
  });

  it("returns 404 for missing session on scene memory GET", async () => {
    const env_ = createEnv();
    const response = await app.request(
      "/api/sessions/missing/scene-memory",
      { method: "GET" },
      env_,
    );

    expect(response.status).toBe(404);
  });

  it("records and reads a Chat usage entry for a session", async () => {
    const env_ = createEnv();
    const created = await createSessionRequest(env_, "usage");
    const createdBody = await readJson<{
      success: boolean;
      session: { id: string };
    }>(created);
    const sessionId = createdBody.session.id;

    const post = await app.request(
      `/api/sessions/${sessionId}/usage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          inputTokens: 1500,
          inputTextTokens: 1400,
          inputImageTokens: 100,
          outputTokens: 80,
          outputTextTokens: 80,
          estimatedCostUsd: 0.0001,
        }),
      },
      env_,
    );
    const postBody = await readJson<{
      success: boolean;
      entry: { mode: string; inputTokens: number; outputTokens: number };
    }>(post);

    expect(post.status).toBe(201);
    expect(postBody.success).toBe(true);
    expect(postBody.entry.mode).toBe("chat");
    expect(postBody.entry.inputTokens).toBe(1500);
    expect(postBody.entry.outputTokens).toBe(80);

    const get = await app.request(`/api/sessions/${sessionId}/usage`, {
      method: "GET",
    }, env_);
    const getBody = await readJson<{
      success: boolean;
      entries: unknown[];
      totals: { turnCount: number; inputTokens: number; estimatedCostUsd: number };
    }>(get);

    expect(get.status).toBe(200);
    expect(getBody.success).toBe(true);
    expect(getBody.entries).toHaveLength(1);
    expect(getBody.totals.turnCount).toBe(1);
    expect(getBody.totals.inputTokens).toBe(1500);
    expect(getBody.totals.estimatedCostUsd).toBeCloseTo(0.0001, 10);
  });

  it("accumulates usage across multiple entries and across sessions (global totals)", async () => {
    const env_ = createEnv();
    const createdA = await createSessionRequest(env_, "A");
    const createdBodyA = await readJson<{
      success: boolean;
      session: { id: string };
    }>(createdA);
    const createdB = await createSessionRequest(env_, "B");
    const createdBodyB = await readJson<{
      success: boolean;
      session: { id: string };
    }>(createdB);

    const beforeGlobal = await app.request("/api/sessions/usage/totals", { method: "GET" }, env_);
    const beforeGlobalBody = await readJson<{
      totals: { turnCount: number; inputTokens: number; outputTokens: number };
    }>(beforeGlobal);
    const baselineTurnCount = beforeGlobalBody.totals.turnCount;
    const baselineInput = beforeGlobalBody.totals.inputTokens;
    const baselineOutput = beforeGlobalBody.totals.outputTokens;

    const record = async (sessionId: string, inputTokens: number) =>
      app.request(
        `/api/sessions/${sessionId}/usage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "realtime",
            inputTokens,
            outputTokens: 50,
          }),
        },
        env_,
      );

    await record(createdBodyA.session.id, 1000);
    await record(createdBodyA.session.id, 2000);
    await record(createdBodyB.session.id, 3000);

    const global = await app.request("/api/sessions/usage/totals", {
      method: "GET",
    }, env_);
    const globalBody = await readJson<{
      success: boolean;
      totals: { turnCount: number; inputTokens: number; outputTokens: number };
    }>(global);

    expect(global.status).toBe(200);
    expect(globalBody.success).toBe(true);
    // 跨会话累计：全局 = 基线 + 本轮新增（容错其它测试遗留状态）。
    expect(globalBody.totals.turnCount).toBe(baselineTurnCount + 3);
    expect(globalBody.totals.inputTokens).toBe(baselineInput + 6000);
    expect(globalBody.totals.outputTokens).toBe(baselineOutput + 150);

    const sessionA = await app.request(
      `/api/sessions/${createdBodyA.session.id}/usage`,
      { method: "GET" },
      env_,
    );
    const sessionABody = await readJson<{
      totals: { turnCount: number; inputTokens: number };
    }>(sessionA);

    expect(sessionABody.totals.turnCount).toBe(2);
    expect(sessionABody.totals.inputTokens).toBe(3000);
  });

  it("updates and reads global budget settings with month spend", async () => {
    const env_ = createEnv();

    // 初始无预算配置：返回默认（未启用护栏）。
    const initial = await app.request("/api/sessions/usage/budget", { method: "GET" }, env_);
    const initialBody = await readJson<{
      success: boolean;
      budget: { monthlyBudgetUsd: number; alertThresholdPct: number };
      month: { estimatedCostUsd: number };
      monthSeries: { dayKey: string; spentUsd: number }[];
      monthHistory: { monthKey: string; estimatedCostUsd: number }[];
      usedPct: number;
    }>(initial);

    expect(initial.status).toBe(200);
    expect(initialBody.success).toBe(true);
    expect(initialBody.budget.monthlyBudgetUsd).toBe(0);
    expect(initialBody.budget.alertThresholdPct).toBe(80);
    expect(initialBody.usedPct).toBe(0);
    // 逐日序列始终返回数组（可能为空）。
    expect(Array.isArray(initialBody.monthSeries)).toBe(true);
    // 历史月份序列始终返回数组（可能为空）。
    expect(Array.isArray(initialBody.monthHistory)).toBe(true);

    // 写入预算配置。
    const put = await app.request(
      "/api/sessions/usage/budget",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudgetUsd: 5, alertThresholdPct: 70 }),
      },
      env_,
    );
    const putBody = await readJson<{ success: boolean; budget: { monthlyBudgetUsd: number; alertThresholdPct: number } }>(put);

    expect(put.status).toBe(200);
    expect(putBody.success).toBe(true);
    expect(putBody.budget.monthlyBudgetUsd).toBe(5);
    expect(putBody.budget.alertThresholdPct).toBe(70);

    // 读取回显。
    const reGet = await app.request("/api/sessions/usage/budget", { method: "GET" }, env_);
    const reGetBody = await readJson<{ budget: { monthlyBudgetUsd: number; alertThresholdPct: number } }>(reGet);
    expect(reGetBody.budget.monthlyBudgetUsd).toBe(5);
    expect(reGetBody.budget.alertThresholdPct).toBe(70);
  });

  it("returns per-day month spend series for the current month", async () => {
    const env_ = createEnv();
    const created = await createSessionRequest(env_, "month-series");
    const createdBody = await readJson<{ session: { id: string } }>(created);
    const sessionId = createdBody.session.id;

    // 写入两条当日用量（同一自然日应聚合为单日一条）。
    const now = Date.now();
    for (const cost of [0.0001, 0.0002]) {
      await app.request(
        `/api/sessions/${sessionId}/usage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chat",
            inputTokens: 100,
            outputTokens: 10,
            estimatedCostUsd: cost,
            recordedAt: now,
          }),
        },
        env_,
      );
    }

    const get = await app.request("/api/sessions/usage/budget", { method: "GET" }, env_);
    const body = await readJson<{
      monthSeries: { dayKey: string; spentUsd: number }[];
      month: { estimatedCostUsd: number };
    }>(get);

    expect(get.status).toBe(200);
    expect(Array.isArray(body.monthSeries)).toBe(true);
    expect(body.monthSeries.length).toBeGreaterThanOrEqual(1);
    // 逐日序列应包含刚写入的两条（合计 ≥ 0.0003）。
    const monthTotal = body.monthSeries.reduce((sum, d) => sum + d.spentUsd, 0);
    expect(monthTotal).toBeGreaterThanOrEqual(0.0003);
    // 不变量：逐日序列之和 == 当月汇总。
    expect(monthTotal).toBeCloseTo(body.month.estimatedCostUsd, 6);
    // 每条都有合法的 dayKey 与非负金额。
    for (const day of body.monthSeries) {
      expect(/^\d{4}-\d{2}-\d{2}$/.test(day.dayKey)).toBe(true);
      expect(day.spentUsd).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects invalid budget input", async () => {
    const env_ = createEnv();
    const response = await app.request(
      "/api/sessions/usage/budget",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudgetUsd: -1 }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; code: string }>(response);

    expect(response.status).toBe(400);
    expect(body.code).toBe("invalid_request");
  });

  it("lists per-session usage summaries for cross-session comparison", async () => {
    const env_ = createEnv();
    const createdA = await createSessionRequest(env_, "A");
    const createdBodyA = await readJson<{ session: { id: string } }>(createdA);
    const createdB = await createSessionRequest(env_, "B");
    const createdBodyB = await readJson<{ session: { id: string } }>(createdB);

    const record = async (sessionId: string, cost: number) =>
      app.request(
        `/api/sessions/${sessionId}/usage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chat",
            inputTokens: 100,
            outputTokens: 50,
            estimatedCostUsd: cost,
          }),
        },
        env_,
      );

    await record(createdBodyA.session.id, 0.01);
    await record(createdBodyA.session.id, 0.02);
    await record(createdBodyB.session.id, 0.05);

    const response = await app.request("/api/sessions/usage/by-session", { method: "GET" }, env_);
    const body = await readJson<{
      success: boolean;
      sessions: { sessionId: string; title: string; turnCount: number; estimatedCostUsd: number }[];
    }>(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // 按估算成本降序：B(0.05) 在 A(0.03) 之前。
    expect(body.sessions[0]?.sessionId).toBe(createdBodyB.session.id);
    expect(body.sessions[0]?.estimatedCostUsd).toBeCloseTo(0.05, 6);
    expect(body.sessions[0]?.title).toBe("B");
    expect(body.sessions[0]?.turnCount).toBe(1);
    expect(body.sessions[1]?.sessionId).toBe(createdBodyA.session.id);
    expect(body.sessions[1]?.estimatedCostUsd).toBeCloseTo(0.03, 6);
    expect(body.sessions[1]?.turnCount).toBe(2);
  });

  it("returns 404 when recording usage for a missing session", async () => {
    const env_ = createEnv();
    const response = await app.request(
      "/api/sessions/missing/usage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", inputTokens: 10 }),
      },
      env_,
    );
    const body = await readJson<{ success: boolean; code: string }>(response);

    expect(response.status).toBe(404);
    expect(body.code).toBe("session_not_found");
  });

  it("returns recent month history aggregated across months for audit", async () => {
    const env_ = createEnv();
    const created = await createSessionRequest(env_, "audit");
    const createdBody = await readJson<{ session: { id: string } }>(created);
    const sessionId = createdBody.session.id;

    // 当前月写入两条用量（同一自然月聚合）。
    const now = Date.now();
    for (const cost of [0.01, 0.02]) {
      await app.request(
        `/api/sessions/${sessionId}/usage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chat",
            inputTokens: 100,
            outputTokens: 10,
            estimatedCostUsd: cost,
            recordedAt: now,
          }),
        },
        env_,
      );
    }

    // 上个月写入一条（聚合到上一个自然月）。
    const lastMonth = new Date(now);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await app.request(
      `/api/sessions/${sessionId}/usage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          inputTokens: 50,
          outputTokens: 5,
          estimatedCostUsd: 0.05,
          recordedAt: lastMonth.getTime(),
        }),
      },
      env_,
    );

    const get = await app.request("/api/sessions/usage/budget", { method: "GET" }, env_);
    const body = await readJson<{
      monthHistory: { monthKey: string; estimatedCostUsd: number; turnCount: number }[];
      month: { estimatedCostUsd: number };
    }>(get);

    expect(get.status).toBe(200);
    expect(Array.isArray(body.monthHistory)).toBe(true);
    // 至少覆盖当前月与上月两个自然月。
    expect(body.monthHistory.length).toBeGreaterThanOrEqual(2);
    // 月份键均为合法 YYYY-MM 且降序。
    for (const row of body.monthHistory) {
      expect(/^\d{4}-\d{2}$/.test(row.monthKey)).toBe(true);
    }
    const keys = body.monthHistory.map((row) => row.monthKey);
    const sortedDesc = [...keys].sort((a, b) => b.localeCompare(a));
    expect(keys).toEqual(sortedDesc);
    // 当前月条目与 month 汇总一致（0.01 + 0.02 = 0.03）。
    const currentKey = keys[0];
    const currentMonth = body.monthHistory.find(
      (row) => row.monthKey === currentKey,
    );
    expect(currentMonth?.estimatedCostUsd).toBeCloseTo(
      body.month.estimatedCostUsd,
      6,
    );
    // 当前月至少含本次新增的 2 轮（其余来自共享 D1 的既有数据）。
    expect(currentMonth?.turnCount).toBeGreaterThanOrEqual(2);
    // 上月条目存在且成本 ≥ 0.05。
    expect(body.monthHistory[1]?.estimatedCostUsd).toBeGreaterThanOrEqual(0.05);
  });
});
