import { z } from "zod";

import type {
  BudgetSettingsRecord,
  MessageModality,
  MessageRecord,
  MessageRole,
  MonthUsageDayRecord,
  MonthUsageSummaryRecord,
  SceneMemoryRecord,
  SessionProviderMode,
  SessionRecord,
  SessionUsageSummaryRecord,
  SessionWithMessages,
  UsageEntryRecord,
  UsageTotalsRecord,
} from "../../lib/db/schema";

// ============= 输入 schema =============

export const sessionProviderModeSchema = z.enum(["chat", "realtime"]);

export const createSessionInputSchema = z.object({
  title: z.string().trim().min(1).max(200).default("新会话"),
  providerMode: sessionProviderModeSchema.default("chat"),
});

export const renameSessionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const listSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const appendMessageInputSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(100_000),
  modality: z.enum(["text", "image", "audio"]).default("text"),
  tokens: z.number().int().nonnegative().nullable().optional(),
});

/** M4.1 场景记忆条目输入。 */
export const sceneMemoryEntrySchema = z.object({
  entryId: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(400),
  frameTokens: z.number().int().nonnegative().nullable().optional(),
  recordedAt: z.number().int().nonnegative().optional(),
});

export const replaceSceneMemoryInputSchema = z.object({
  entries: z.array(sceneMemoryEntrySchema).max(50),
});

/** 单轮用量持久化输入（Chat / Realtime 每轮 token 用量）。 */
export const recordUsageInputSchema = z.object({
  mode: sessionProviderModeSchema.default("chat"),
  inputTokens: z.number().int().nonnegative().default(0),
  inputTextTokens: z.number().int().nonnegative().default(0),
  inputAudioTokens: z.number().int().nonnegative().default(0),
  inputImageTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().default(0),
  cachedTextTokens: z.number().int().nonnegative().default(0),
  cachedAudioTokens: z.number().int().nonnegative().default(0),
  cachedImageTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  outputTextTokens: z.number().int().nonnegative().default(0),
  outputAudioTokens: z.number().int().nonnegative().default(0),
  estimatedCostUsd: z.number().nonnegative().default(0),
  /** 记录时间戳（ms）；缺省时由服务端取当前时间。 */
  recordedAt: z.number().int().nonnegative().optional(),
});

/** 全局预算护栏配置输入（跨会话成本护栏）。 */
export const updateBudgetInputSchema = z.object({
  monthlyBudgetUsd: z.number().nonnegative().default(0),
  alertThresholdPct: z.number().min(1).max(100).default(80),
});

// ============= 输出类型 =============

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type RenameSessionInput = z.infer<typeof renameSessionInputSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type AppendMessageInput = z.infer<typeof appendMessageInputSchema>;

export type CreateSessionOutput =
  | { success: true; session: SessionRecord }
  | { success: false; error: string; code: string };

export type ListSessionsOutput =
  | { success: true; sessions: SessionRecord[]; total: number; limit: number; offset: number }
  | { success: false; error: string; code: string };

export type GetSessionOutput =
  | { success: true; session: SessionWithMessages }
  | { success: false; error: string; code: string };

export type RenameSessionOutput =
  | { success: true; session: SessionRecord }
  | { success: false; error: string; code: string };

export type DeleteSessionOutput =
  | { success: true; deleted: boolean }
  | { success: false; error: string; code: string };

export type AppendMessageOutput =
  | { success: true; message: MessageRecord }
  | { success: false; error: string; code: string };

export type ListSceneMemoryOutput =
  | { success: true; entries: SceneMemoryRecord[] }
  | { success: false; error: string; code: string };

export type ReplaceSceneMemoryOutput =
  | { success: true; saved: number; entries: SceneMemoryRecord[] }
  | { success: false; error: string; code: string };

export type RecordUsageOutput =
  | { success: true; entry: UsageEntryRecord }
  | { success: false; error: string; code: string };

export type ListUsageOutput =
  | { success: true; entries: UsageEntryRecord[]; totals: UsageTotalsRecord }
  | { success: false; error: string; code: string };

export type GlobalUsageOutput =
  | { success: true; totals: UsageTotalsRecord }
  | { success: false; error: string; code: string };

/** 全局预算护栏视图（预算配置 + 当月用量 + 使用率 + 逐日消费序列）。 */
export type BudgetViewOutput =
  | {
      success: true;
      budget: BudgetSettingsRecord;
      month: MonthUsageSummaryRecord;
      /** 当月逐日消费序列（供全局月度趋势外推）。 */
      monthSeries: MonthUsageDayRecord[];
      /** 最近 count 个自然月（含当前）逐月用量（供预算历史审计）。 */
      monthHistory: MonthUsageSummaryRecord[];
      usedPct: number;
    }
  | { success: false; error: string; code: string };

/** 跨会话成本对比：按会话聚合的用量汇总。 */
export type SessionComparisonOutput =
  | { success: true; sessions: SessionUsageSummaryRecord[]; total: number }
  | { success: false; error: string; code: string };

export type RecordUsageInput = z.infer<typeof recordUsageInputSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetInputSchema>;

export type { MessageModality, MessageRole, SessionProviderMode };
