/**
 * D1 会话持久化的 SQL 常量与行类型映射。
 *
 * D1 是 Workers 原生 SQLite，直接使用原生 SQL（不引入 Drizzle ORM），
 * 减少依赖面并保持与 Workers 运行时的最小耦合。
 */

export const SESSION_PROVIDER_MODES = ["chat", "realtime"] as const;
export type SessionProviderMode = (typeof SESSION_PROVIDER_MODES)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_MODALITIES = ["text", "image", "audio"] as const;
export type MessageModality = (typeof MESSAGE_MODALITIES)[number];

/** 会话表原始行。 */
export type SessionRow = {
  id: string;
  title: string;
  provider_mode: SessionProviderMode;
  created_at: number;
  updated_at: number;
};

/** 消息表原始行。 */
export type MessageRow = {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  modality: MessageModality;
  tokens: number | null;
  created_at: number;
};

/** 会话列表项（含消息数，来自 LEFT JOIN COUNT）。 */
export type SessionSummaryRow = SessionRow & {
  message_count: number;
};

/** 帧表原始行。 */
export type FrameRow = {
  id: string;
  session_id: string;
  message_id: string | null;
  data_url_ref: string;
  created_at: number;
};

/** 场景记忆表原始行。 */
export type SceneMemoryRow = {
  id: string;
  session_id: string;
  entry_id: string;
  summary: string;
  frame_tokens: number | null;
  recorded_at: number;
};

/** 领域模型：场景记忆条目。 */
export type SceneMemoryRecord = {
  id: string;
  sessionId: string;
  entryId: string;
  summary: string;
  frameTokens: number | null;
  recordedAt: number;
};

/** 领域模型：会话（含可选消息列表）。 */
export type SessionRecord = {
  id: string;
  title: string;
  providerMode: SessionProviderMode;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

/** 领域模型：消息。 */
export type MessageRecord = {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  modality: MessageModality;
  tokens: number | null;
  createdAt: number;
};

/** 领域模型：完整会话（含消息列表）。 */
export type SessionWithMessages = SessionRecord & {
  messages: MessageRecord[];
};

/** 用量记录表原始行（Chat / Realtime 每轮 token 用量）。 */
export type UsageEntryRow = {
  id: string;
  session_id: string;
  mode: SessionProviderMode;
  input_tokens: number;
  input_text_tokens: number;
  input_audio_tokens: number;
  input_image_tokens: number;
  cached_input_tokens: number;
  cached_text_tokens: number;
  cached_audio_tokens: number;
  cached_image_tokens: number;
  output_tokens: number;
  output_text_tokens: number;
  output_audio_tokens: number;
  estimated_cost_usd: number;
  recorded_at: number;
};

/** 领域模型：单轮用量记录。 */
export type UsageEntryRecord = {
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
  recordedAt: number;
};

/** 领域模型：某会话（或全局）的累计用量汇总。 */
export type UsageTotalsRecord = {
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

/** 预算配置表原始行（单行：id = 'global'）。 */
export type BudgetSettingsRow = {
  id: string;
  monthly_budget_usd: number;
  alert_threshold_pct: number;
  updated_at: number;
};

/** 领域模型：跨会话成本护栏的预算配置。 */
export type BudgetSettingsRecord = {
  monthlyBudgetUsd: number;
  alertThresholdPct: number;
  updatedAt: number;
};

/** 按会话聚合的用量汇总行（跨会话成本对比）。 */
export type SessionUsageSummaryRow = {
  session_id: string;
  title: string;
  provider_mode: SessionProviderMode;
  turn_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  recorded_at: number;
};

/** 领域模型：某会话的用量汇总（用于跨会话成本对比）。 */
export type SessionUsageSummaryRecord = {
  sessionId: string;
  title: string;
  providerMode: SessionProviderMode;
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  lastRecordedAt: number;
};

/** 按月份聚合的用量汇总行（预算护栏按自然月统计）。 */
export type MonthUsageSummaryRow = {
  month_key: string;
  turn_count: number;
  estimated_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
};

/** 领域模型：某自然月的用量汇总。 */
export type MonthUsageSummaryRecord = {
  monthKey: string;
  turnCount: number;
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
};

/** 按日聚合的用量行（用于全局月度消费趋势外推）。 */
export type MonthUsageDayRow = {
  day_key: string;
  spent_usd: number;
};

/** 领域模型：某自然月某天的消费（供月度外推）。 */
export type MonthUsageDayRecord = {
  dayKey: string;
  spentUsd: number;
};
