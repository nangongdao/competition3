import { withClientAccessToken } from "@/modules/assistant/lib/api-client";
import { isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  AppendMessageOutput,
  BudgetViewOutput,
  CreateSessionOutput,
  DeleteSessionOutput,
  GetSessionOutput,
  GlobalUsageOutput,
  ListSceneMemoryOutput,
  ListSessionsOutput,
  ListUsageOutput,
  RenameSessionOutput,
  ReplaceSceneMemoryOutput,
  RecordUsageOutput,
  SessionComparisonOutput,
} from "../../../../src/worker/routes/sessions/types";
import type {
  MessageModality,
  MessageRole,
} from "../../../../src/worker/routes/sessions/types";

export type {
  MessageModality,
  MessageRole,
} from "../../../../src/worker/routes/sessions/types";

export type SessionSummary = {
  id: string;
  title: string;
  providerMode: "chat" | "realtime";
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

export type SessionMessage = {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  modality: MessageModality;
  tokens: number | null;
  createdAt: number;
};

export type SessionDetail = SessionSummary & {
  messages: SessionMessage[];
};

export type CreateSessionParams = {
  title?: string;
  providerMode?: "chat" | "realtime";
};

export type AppendMessageParams = {
  role: MessageRole;
  content: string;
  modality?: MessageModality;
  tokens?: number | null;
};

/** 会话级用量记录（Chat / Realtime 每轮 token 用量）。 */
export type UsageTotals = {
  turnCount: number;
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
};

export type RecordUsageParams = {
  mode?: "chat" | "realtime";
  inputTokens?: number;
  inputTextTokens?: number;
  inputAudioTokens?: number;
  inputImageTokens?: number;
  cachedInputTokens?: number;
  cachedTextTokens?: number;
  cachedAudioTokens?: number;
  cachedImageTokens?: number;
  outputTokens?: number;
  outputTextTokens?: number;
  outputAudioTokens?: number;
  estimatedCostUsd?: number;
};

/** 单轮用量记录。 */
export type UsageEntry = {
  id: string;
  sessionId: string;
  mode: "chat" | "realtime";
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
  recordedAt: number;
};

export type SessionUsage = {
  entries: UsageEntry[];
  totals: UsageTotals;
};

function isSuccessOutput(
  value: unknown,
): value is { success: true } {
  return isRecord(value) && value.success === true;
}

/** 创建会话。返回会话摘要，失败返回 null。 */
export async function createSession(
  params: CreateSessionParams,
): Promise<SessionSummary | null> {
  const response = await fetch(
    "/api/sessions",
    withClientAccessToken({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as CreateSessionOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return body.session;
}

/** 列出会话（按 updated_at desc）。 */
export async function listSessions(
  limit = 50,
  offset = 0,
): Promise<SessionSummary[]> {
  const response = await fetch(
    `/api/sessions?limit=${limit}&offset=${offset}`,
    withClientAccessToken(),
  );

  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as ListSessionsOutput;

  if (!isSuccessOutput(body)) {
    return [];
  }

  return body.sessions;
}

/** 获取会话及其消息。不存在返回 null。 */
export async function getSessionWithMessages(
  sessionId: string,
): Promise<SessionDetail | null> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    withClientAccessToken(),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as GetSessionOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return body.session;
}

/** 重命名会话。成功返回 true。 */
export async function renameSession(
  sessionId: string,
  title: string,
): Promise<boolean> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    withClientAccessToken({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as RenameSessionOutput;

  return isSuccessOutput(body);
}

/** 删除会话。成功返回 true。 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    withClientAccessToken({ method: "DELETE" }),
  );

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as DeleteSessionOutput;

  return isSuccessOutput(body);
}

/** 向会话追加一条消息。成功返回消息，失败返回 null。 */
export async function appendSessionMessage(
  sessionId: string,
  params: AppendMessageParams,
): Promise<SessionMessage | null> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    withClientAccessToken({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as AppendMessageOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return body.message;
}

/** 场景记忆条目（前端类型）。 */
export type SceneMemoryEntry = {
  entryId: string;
  summary: string;
  frameTokens?: number | null;
  recordedAt?: number;
};

/** 读取某会话的场景记忆条目（按记录时间升序）。失败返回 null。 */
export async function getSessionSceneMemory(
  sessionId: string,
): Promise<SceneMemoryEntry[] | null> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/scene-memory`,
    withClientAccessToken({ method: "GET" }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as ListSceneMemoryOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return body.entries;
}

/** 记录一轮 Chat / Realtime 用量到指定会话。成功返回用量记录，失败返回 null。 */
export async function recordSessionUsage(
  sessionId: string,
  params: RecordUsageParams,
): Promise<UsageEntry | null> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/usage`,
    withClientAccessToken({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as RecordUsageOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return body.entry;
}

/** 读取某会话的用量记录与累计汇总。失败返回 null。 */
export async function getSessionUsage(
  sessionId: string,
): Promise<SessionUsage | null> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/usage`,
    withClientAccessToken({ method: "GET" }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as ListUsageOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return { entries: body.entries, totals: body.totals };
}

/** 全局用量累计（跨所有会话聚合）。失败返回 null。 */
export async function getGlobalUsageTotals(): Promise<UsageTotals | null> {
  const response = await fetch(
    "/api/sessions/usage/totals",
    withClientAccessToken({ method: "GET" }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as GlobalUsageOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return body.totals;
}

/** 覆盖保存某会话的场景记忆。成功返回保存条数，失败返回 -1。 */
export async function replaceSessionSceneMemory(
  sessionId: string,
  entries: readonly SceneMemoryEntry[],
): Promise<number> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/scene-memory`,
    withClientAccessToken({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    }),
  );

  if (!response.ok) {
    return -1;
  }

  const body = (await response.json()) as ReplaceSceneMemoryOutput;

  if (!isSuccessOutput(body)) {
    return -1;
  }

  return body.saved;
}

/** 预算配置（跨会话成本护栏）。 */
export type BudgetSettings = {
  monthlyBudgetUsd: number;
  alertThresholdPct: number;
  updatedAt: number;
};

/** 某自然月的用量汇总（预算护栏按自然月统计）。 */
export type MonthUsageSummary = {
  monthKey: string;
  turnCount: number;
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
};

/** 某自然月某天的消费（供全局月度趋势外推）。 */
export type MonthUsageDay = {
  dayKey: string;
  spentUsd: number;
};

/** 全局预算护栏视图（预算配置 + 当月用量 + 逐日消费序列 + 使用率）。 */
export type BudgetView = {
  budget: BudgetSettings;
  month: MonthUsageSummary;
  monthSeries: MonthUsageDay[];
  monthHistory: MonthUsageSummary[];
  usedPct: number;
};

/** 按会话聚合的用量汇总（跨会话成本对比）。 */
export type SessionUsageSummary = {
  sessionId: string;
  title: string;
  providerMode: "chat" | "realtime";
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  lastRecordedAt: number;
};

/** 读取全局预算护栏视图。失败返回 null。 */
export async function getGlobalBudgetView(): Promise<BudgetView | null> {
  const response = await fetch(
    "/api/sessions/usage/budget",
    withClientAccessToken({ method: "GET" }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as BudgetViewOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return {
    budget: body.budget,
    month: body.month,
    monthSeries: body.monthSeries ?? [],
    monthHistory: body.monthHistory ?? [],
    usedPct: body.usedPct,
  };
}

/** 覆盖保存全局预算配置。成功返回最新护栏视图，失败返回 null。 */
export async function updateGlobalBudget(params: {
  monthlyBudgetUsd: number;
  alertThresholdPct: number;
}): Promise<BudgetView | null> {
  const response = await fetch(
    "/api/sessions/usage/budget",
    withClientAccessToken({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as BudgetViewOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return {
    budget: body.budget,
    month: body.month,
    monthSeries: body.monthSeries ?? [],
    monthHistory: body.monthHistory ?? [],
    usedPct: body.usedPct,
  };
}

/** 读取按会话聚合的用量汇总（跨会话成本对比）。失败返回 null。 */
export async function getSessionUsageSummaries(): Promise<
  SessionUsageSummary[] | null
> {
  const response = await fetch(
    "/api/sessions/usage/by-session",
    withClientAccessToken({ method: "GET" }),
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as SessionComparisonOutput;

  if (!isSuccessOutput(body)) {
    return null;
  }

  return body.sessions;
}
