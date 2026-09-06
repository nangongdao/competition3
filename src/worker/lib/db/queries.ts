import type {
  BudgetSettingsRecord,
  BudgetSettingsRow,
  MessageModality,
  MessageRole,
  MessageRow,
  MonthUsageSummaryRecord,
  MonthUsageSummaryRow,
  SceneMemoryRecord,
  SceneMemoryRow,
  SessionProviderMode,
  SessionRecord,
  SessionRow,
  SessionSummaryRow,
  SessionUsageSummaryRecord,
  SessionUsageSummaryRow,
  SessionWithMessages,
  MessageRecord,
  MonthUsageDayRecord,
  MonthUsageDayRow,
  UsageEntryRecord,
  UsageEntryRow,
  UsageTotalsRecord,
} from "./schema";

/**
 * D1 会话/消息查询封装。
 *
 * 所有查询针对单个 D1 binding（`SESSIONS_DB`）。会话 CRUD 无上游额度成本，
 * 但仍是数据库 I/O，遵循"不 await 循环""用 inArray/JOIN 而非 N+1"等约束。
 */

function mapSessionRow(row: SessionRow, messageCount: number): SessionRecord {
  return {
    id: row.id,
    title: row.title,
    providerMode: row.provider_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount,
  };
}

function mapMessageRow(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    modality: row.modality,
    tokens: row.tokens,
    createdAt: row.created_at,
  };
}

/** 创建会话。 */
export async function createSession(
  db: D1Database,
  input: {
    id: string;
    title: string;
    providerMode: SessionProviderMode;
    now: number;
  },
): Promise<SessionRecord> {
  await db
    .prepare(
      `INSERT INTO sessions (id, title, provider_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.title, input.providerMode, input.now, input.now)
    .run();

  return {
    id: input.id,
    title: input.title,
    providerMode: input.providerMode,
    createdAt: input.now,
    updatedAt: input.now,
    messageCount: 0,
  };
}

/** 列出会话（按 updated_at desc），含消息数。 */
export async function listSessions(
  db: D1Database,
  limit: number,
  offset: number,
): Promise<SessionRecord[]> {
  const rows = await db
    .prepare(
      `SELECT s.id, s.title, s.provider_mode, s.created_at, s.updated_at,
              COUNT(m.id) AS message_count
         FROM sessions s
         LEFT JOIN messages m ON m.session_id = s.id
        GROUP BY s.id
        ORDER BY s.updated_at DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<SessionSummaryRow>();

  return rows.results.map((row) =>
    mapSessionRow(row, Number(row.message_count)),
  );
}

/** 按 id 获取会话（无消息），不存在返回 null。 */
export async function getSession(
  db: D1Database,
  id: string,
): Promise<SessionRecord | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.title, s.provider_mode, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
         FROM sessions s
        WHERE s.id = ?`,
    )
    .bind(id)
    .first<SessionSummaryRow>();

  if (row === null) {
    return null;
  }

  return mapSessionRow(row, Number(row.message_count));
}

/** 按 id 获取会话及其全部消息（按 created_at asc）。 */
export async function getSessionWithMessages(
  db: D1Database,
  id: string,
): Promise<SessionWithMessages | null> {
  const session = await getSession(db, id);

  if (session === null) {
    return null;
  }

  const messageRows = await db
    .prepare(
      `SELECT id, session_id, role, content, modality, tokens, created_at
         FROM messages
        WHERE session_id = ?
        ORDER BY created_at ASC, rowid ASC`,
    )
    .bind(id)
    .all<MessageRow>();

  return {
    ...session,
    messages: messageRows.results.map(mapMessageRow),
  };
}

/** 重命名会话，更新 updated_at。返回是否命中。 */
export async function renameSession(
  db: D1Database,
  id: string,
  title: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE sessions
          SET title = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(title, now, id)
    .run();

  return result.meta.changes > 0;
}

/** 删除会话（级联删消息/帧）。返回是否命中。 */
export async function deleteSession(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM sessions WHERE id = ?`)
    .bind(id)
    .run();

  return result.meta.changes > 0;
}

/** 追加一条消息，并更新会话 updated_at。 */
export async function appendMessage(
  db: D1Database,
  input: {
    id: string;
    sessionId: string;
    role: MessageRole;
    content: string;
    modality: MessageModality;
    tokens: number | null;
    now: number;
  },
): Promise<MessageRecord> {
  const session = await getSession(db, input.sessionId);

  if (session === null) {
    throw new Error("SESSION_NOT_FOUND");
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, modality, tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.sessionId,
        input.role,
        input.content,
        input.modality,
        input.tokens,
        input.now,
      ),
    db
      .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
      .bind(input.now, input.sessionId),
  ]);

  return {
    id: input.id,
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    modality: input.modality,
    tokens: input.tokens,
    createdAt: input.now,
  };
}

function mapSceneMemoryRow(row: SceneMemoryRow): SceneMemoryRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    entryId: row.entry_id,
    summary: row.summary,
    frameTokens: row.frame_tokens,
    recordedAt: row.recorded_at,
  };
}

/** 读取某会话的场景记忆条目（按记录时间升序）。 */
export async function listSceneMemory(
  db: D1Database,
  sessionId: string,
  limit = 20,
): Promise<SceneMemoryRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, session_id, entry_id, summary, frame_tokens, recorded_at
       FROM scene_memory
       WHERE session_id = ?
       ORDER BY recorded_at ASC
       LIMIT ?`,
    )
    .bind(sessionId, limit)
    .all<SceneMemoryRow>();

  return (result.results ?? []).map(mapSceneMemoryRow);
}

function mapUsageEntryRow(row: UsageEntryRow): UsageEntryRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    mode: row.mode,
    inputTokens: row.input_tokens,
    inputTextTokens: row.input_text_tokens,
    inputAudioTokens: row.input_audio_tokens,
    inputImageTokens: row.input_image_tokens,
    cachedInputTokens: row.cached_input_tokens,
    cachedTextTokens: row.cached_text_tokens,
    cachedAudioTokens: row.cached_audio_tokens,
    cachedImageTokens: row.cached_image_tokens,
    outputTokens: row.output_tokens,
    outputTextTokens: row.output_text_tokens,
    outputAudioTokens: row.output_audio_tokens,
    estimatedCostUsd: row.estimated_cost_usd,
    recordedAt: row.recorded_at,
  };
}

/** 记录一条用量（Chat / Realtime 每轮 token 用量），并更新会话 updated_at。 */
export async function recordUsageEntry(
  db: D1Database,
  input: {
    id: string;
    sessionId: string;
    mode: SessionProviderMode;
    inputTokens: number;
    inputTextTokens: number;
    inputAudioTokens: number;
    inputImageTokens: number;
    cachedInputTokens: number;
    cachedTextTokens: number;
    cachedAudioTokens: number;
    cachedImageTokens: number;
    outputTokens: number;
    outputTextTokens: number;
    outputAudioTokens: number;
    estimatedCostUsd: number;
    now: number;
  },
): Promise<UsageEntryRecord | null> {
  const session = await getSession(db, input.sessionId);

  if (session === null) {
    return null;
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO usage_entries (
          id, session_id, mode,
          input_tokens, input_text_tokens, input_audio_tokens, input_image_tokens,
          cached_input_tokens, cached_text_tokens, cached_audio_tokens, cached_image_tokens,
          output_tokens, output_text_tokens, output_audio_tokens,
          estimated_cost_usd, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.sessionId,
        input.mode,
        input.inputTokens,
        input.inputTextTokens,
        input.inputAudioTokens,
        input.inputImageTokens,
        input.cachedInputTokens,
        input.cachedTextTokens,
        input.cachedAudioTokens,
        input.cachedImageTokens,
        input.outputTokens,
        input.outputTextTokens,
        input.outputAudioTokens,
        input.estimatedCostUsd,
        input.now,
      ),
    db
      .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
      .bind(input.now, input.sessionId),
  ]);

  return mapUsageEntryRow({
    id: input.id,
    session_id: input.sessionId,
    mode: input.mode,
    input_tokens: input.inputTokens,
    input_text_tokens: input.inputTextTokens,
    input_audio_tokens: input.inputAudioTokens,
    input_image_tokens: input.inputImageTokens,
    cached_input_tokens: input.cachedInputTokens,
    cached_text_tokens: input.cachedTextTokens,
    cached_audio_tokens: input.cachedAudioTokens,
    cached_image_tokens: input.cachedImageTokens,
    output_tokens: input.outputTokens,
    output_text_tokens: input.outputTextTokens,
    output_audio_tokens: input.outputAudioTokens,
    estimated_cost_usd: input.estimatedCostUsd,
    recorded_at: input.now,
  });
}

/** 读取某会话的用量记录（按记录时间升序）。 */
export async function listUsageEntries(
  db: D1Database,
  sessionId: string,
  limit = 200,
): Promise<UsageEntryRecord[]> {
  const rows = await db
    .prepare(
      `SELECT id, session_id, mode,
              input_tokens, input_text_tokens, input_audio_tokens, input_image_tokens,
              cached_input_tokens, cached_text_tokens, cached_audio_tokens, cached_image_tokens,
              output_tokens, output_text_tokens, output_audio_tokens,
              estimated_cost_usd, recorded_at
         FROM usage_entries
        WHERE session_id = ?
        ORDER BY recorded_at ASC
        LIMIT ?`,
    )
    .bind(sessionId, limit)
    .all<UsageEntryRow>();

  return (rows.results ?? []).map(mapUsageEntryRow);
}

/**
 * 汇总某会话（sessionId 给定）或全局（sessionId 为 null）的累计用量。
 * 跨会话累计时对所有 usage_entries 聚合。
 */
export async function getUsageTotals(
  db: D1Database,
  sessionId: string | null,
): Promise<UsageTotalsRecord> {
  const whereClause = sessionId === null ? "" : "WHERE session_id = ?";
  const args = sessionId === null ? [] : [sessionId];
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS turn_count,
              SUM(input_tokens) AS input_tokens,
              SUM(input_text_tokens) AS input_text_tokens,
              SUM(input_audio_tokens) AS input_audio_tokens,
              SUM(input_image_tokens) AS input_image_tokens,
              SUM(cached_input_tokens) AS cached_input_tokens,
              SUM(cached_text_tokens) AS cached_text_tokens,
              SUM(cached_audio_tokens) AS cached_audio_tokens,
              SUM(cached_image_tokens) AS cached_image_tokens,
              SUM(output_tokens) AS output_tokens,
              SUM(output_text_tokens) AS output_text_tokens,
              SUM(output_audio_tokens) AS output_audio_tokens,
              SUM(estimated_cost_usd) AS estimated_cost_usd
         FROM usage_entries
         ${whereClause}`,
    )
    .bind(...args)
    .first<Record<string, number | null>>();

  if (row === null) {
    return {
      turnCount: 0,
      inputTokens: 0,
      inputTextTokens: 0,
      inputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputTokens: 0,
      cachedTextTokens: 0,
      cachedAudioTokens: 0,
      cachedImageTokens: 0,
      outputTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
      estimatedCostUsd: 0,
    };
  }

  const num = (value: number | null | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return {
    turnCount: num(row.turn_count),
    inputTokens: num(row.input_tokens),
    inputTextTokens: num(row.input_text_tokens),
    inputAudioTokens: num(row.input_audio_tokens),
    inputImageTokens: num(row.input_image_tokens),
    cachedInputTokens: num(row.cached_input_tokens),
    cachedTextTokens: num(row.cached_text_tokens),
    cachedAudioTokens: num(row.cached_audio_tokens),
    cachedImageTokens: num(row.cached_image_tokens),
    outputTokens: num(row.output_tokens),
    outputTextTokens: num(row.output_text_tokens),
    outputAudioTokens: num(row.output_audio_tokens),
    estimatedCostUsd: num(row.estimated_cost_usd),
  };
}

/** 读取全局预算配置；不存在时返回默认配置（未启用护栏）。 */
export async function getBudgetSettings(
  db: D1Database,
): Promise<BudgetSettingsRecord> {
  const row = await db
    .prepare(
      `SELECT id, monthly_budget_usd, alert_threshold_pct, updated_at
         FROM budget_settings
        WHERE id = ?`,
    )
    .bind("global")
    .first<BudgetSettingsRow>();

  if (row === null) {
    return { monthlyBudgetUsd: 0, alertThresholdPct: 80, updatedAt: 0 };
  }

  return {
    monthlyBudgetUsd: row.monthly_budget_usd,
    alertThresholdPct: row.alert_threshold_pct,
    updatedAt: row.updated_at,
  };
}

/** 覆盖保存全局预算配置（单行：id = 'global'）。 */
export async function upsertBudgetSettings(
  db: D1Database,
  input: {
    monthlyBudgetUsd: number;
    alertThresholdPct: number;
    now: number;
  },
): Promise<BudgetSettingsRecord> {
  await db
    .prepare(
      `INSERT INTO budget_settings (id, monthly_budget_usd, alert_threshold_pct, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         monthly_budget_usd = excluded.monthly_budget_usd,
         alert_threshold_pct = excluded.alert_threshold_pct,
         updated_at = excluded.updated_at`,
    )
    .bind("global", input.monthlyBudgetUsd, input.alertThresholdPct, input.now)
    .run();

  return {
    monthlyBudgetUsd: input.monthlyBudgetUsd,
    alertThresholdPct: input.alertThresholdPct,
    updatedAt: input.now,
  };
}

/** 读取某自然月（YYYY-MM）的累计用量汇总（预算护栏按自然月统计）。 */
export async function getMonthUsageTotals(
  db: D1Database,
  monthKey: string,
): Promise<MonthUsageSummaryRecord> {
  const row = await db
    .prepare(
      `SELECT ? AS month_key,
              COUNT(*) AS turn_count,
              SUM(estimated_cost_usd) AS estimated_cost_usd,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens
         FROM usage_entries
        WHERE strftime('%Y-%m', recorded_at / 1000, 'unixepoch') = ?`,
    )
    .bind(monthKey, monthKey)
    .first<Record<string, number | null>>();

  const num = (value: number | null | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return {
    monthKey,
    turnCount: num(row?.turn_count),
    estimatedCostUsd: num(row?.estimated_cost_usd),
    inputTokens: num(row?.input_tokens),
    outputTokens: num(row?.output_tokens),
  };
}

/** 读取某自然月（YYYY-MM）的逐日消费序列（供全局月度趋势外推）。 */
export async function getMonthUsageDailySeries(
  db: D1Database,
  monthKey: string,
): Promise<MonthUsageDayRecord[]> {
  const rows = await db
    .prepare(
      `SELECT strftime('%Y-%m-%d', recorded_at / 1000, 'unixepoch') AS day_key,
              SUM(estimated_cost_usd) AS spent_usd
         FROM usage_entries
        WHERE strftime('%Y-%m', recorded_at / 1000, 'unixepoch') = ?
        GROUP BY strftime('%Y-%m-%d', recorded_at / 1000, 'unixepoch')
        ORDER BY day_key ASC`,
    )
    .bind(monthKey)
    .all<MonthUsageDayRow>();

  const num = (value: number | null | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return (rows.results ?? []).map((row) => ({
    dayKey: row.day_key,
    spentUsd: num(row.spent_usd),
  }));
}

/** 读取最近 count 个自然月（含当前）的逐月用量汇总（供预算历史审计）。 */
export async function listRecentMonthUsage(
  db: D1Database,
  count: number,
): Promise<MonthUsageSummaryRecord[]> {
  const rows = await db
    .prepare(
      `SELECT strftime('%Y-%m', recorded_at / 1000, 'unixepoch') AS month_key,
              COUNT(*) AS turn_count,
              SUM(estimated_cost_usd) AS estimated_cost_usd,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens
         FROM usage_entries
        GROUP BY month_key
        ORDER BY month_key DESC
        LIMIT ?`,
    )
    .bind(count)
    .all<MonthUsageSummaryRow>();

  const num = (value: number | null | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return (rows.results ?? []).map((row) => ({
    monthKey: row.month_key,
    turnCount: num(row.turn_count),
    estimatedCostUsd: num(row.estimated_cost_usd),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
  }));
}

/** 跨会话成本对比：按会话聚合累计用量（按估算成本降序）。 */
export async function listSessionUsageSummaries(
  db: D1Database,
  limit = 50,
): Promise<SessionUsageSummaryRecord[]> {
  const rows = await db
    .prepare(
      `SELECT u.session_id,
              COALESCE(s.title, '') AS title,
              COALESCE(s.provider_mode, 'chat') AS provider_mode,
              COUNT(*) AS turn_count,
              SUM(u.input_tokens) AS input_tokens,
              SUM(u.output_tokens) AS output_tokens,
              SUM(u.estimated_cost_usd) AS estimated_cost_usd,
              MAX(u.recorded_at) AS recorded_at
         FROM usage_entries u
         LEFT JOIN sessions s ON s.id = u.session_id
        GROUP BY u.session_id, s.title, s.provider_mode
        ORDER BY estimated_cost_usd DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<SessionUsageSummaryRow>();

  const num = (value: number | null | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return (rows.results ?? []).map((row) => ({
    sessionId: row.session_id,
    title: row.title,
    providerMode: row.provider_mode,
    turnCount: num(row.turn_count),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    estimatedCostUsd: num(row.estimated_cost_usd),
    lastRecordedAt: num(row.recorded_at),
  }));
}

/** 覆盖保存某会话的场景记忆（先删后插，保证与内存窗口一致）。 */
export async function replaceSceneMemory(
  db: D1Database,
  sessionId: string,
  entries: readonly {
    entryId: string;
    summary: string;
    frameTokens: number | null;
    recordedAt: number;
  }[],
): Promise<number> {
  const session = await getSession(db, sessionId);

  if (session === null) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const statements = [
    db.prepare(`DELETE FROM scene_memory WHERE session_id = ?`).bind(sessionId),
  ];

  for (const entry of entries) {
    statements.push(
      db
        .prepare(
          `INSERT INTO scene_memory (id, session_id, entry_id, summary, frame_tokens, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          sessionId,
          entry.entryId,
          entry.summary,
          entry.frameTokens,
          entry.recordedAt,
        ),
    );
  }

  await db.batch(statements);
  return entries.length;
}
