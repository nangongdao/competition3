import { describe, expect, it } from "vitest";

import type { TranscriptEntry } from "@/modules/assistant/types";
import {
  buildTextHistorySummary,
  estimateTextTokens,
  TEXT_HISTORY_DEFAULT_CONFIG,
} from "@/modules/assistant/lib/text-history-summarize";

function entry(
  id: string,
  speaker: TranscriptEntry["speaker"],
  text: string,
): TranscriptEntry {
  return { id, speaker, text, createdAt: 0 };
}

describe("estimateTextTokens", () => {
  it("空字符串返回 0", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("   ")).toBe(0);
  });

  it("按字符数 / 4 向上取整估算", () => {
    // 4 字符 → 1 token
    expect(estimateTextTokens("abcd")).toBe(1);
    // 8 字符 → 2 token
    expect(estimateTextTokens("abcdefgh")).toBe(2);
    // 5 字符 → 2 token（向上取整）
    expect(estimateTextTokens("abcde")).toBe(2);
  });
});

describe("buildTextHistorySummary", () => {
  it("空转写返回空 context", () => {
    const result = buildTextHistorySummary([]);
    expect(result.context).toBe("");
    expect(result.summarizedEntryCount).toBe(0);
    expect(result.savedTextTokens).toBe(0);
  });

  it("只有 system 条目时无可压缩历史", () => {
    const result = buildTextHistorySummary([
      entry("s1", "system", "系统就绪"),
    ]);
    expect(result.context).toBe("");
    expect(result.summarizedEntryCount).toBe(0);
  });

  it("对话轮次不超过 verbatim 上限时不压缩", () => {
    const turns = [
      entry("u1", "user", "你好"),
      entry("a1", "assistant", "你好！"),
    ];
    const result = buildTextHistorySummary(turns);
    expect(result.context).toBe("");
    expect(result.summarizedEntryCount).toBe(0);
  });

  it("超过上限时压缩最旧轮次，保留最新轮次原文", () => {
    // 7 条对话，maxVerbatimTurns=6 → 压缩最旧 1 条。
    const turns = [
      entry("u1", "user", "最早的问题"),
      entry("a1", "assistant", "最早的答复"),
      entry("u2", "user", "第二个问题"),
      entry("a2", "assistant", "第二个答复"),
      entry("u3", "user", "第三个问题"),
      entry("a3", "assistant", "第三个答复"),
      entry("u4", "user", "最新问题"),
    ];
    const result = buildTextHistorySummary(turns);
    expect(result.summarizedEntryCount).toBe(1);
    expect(result.context).toContain("[此前 1 条对话摘要]");
    expect(result.context).toContain("user: 最早的问题");
    // 最新的 6 条不进入摘要。
    expect(result.context).not.toContain("第二个问题");
    expect(result.context).not.toContain("最新问题");
  });

  it("单轮超长文本被压缩为单行并截断", () => {
    const longText = "x".repeat(300);
    const turns = [
      entry("u1", "user", longText),
      entry("a1", "assistant", "简短答复"),
      entry("u2", "user", "新问题"),
    ];
    // maxVerbatimTurns=1 → 压缩最旧 2 条。
    const result = buildTextHistorySummary(turns, { maxVerbatimTurns: 1, maxSummaryLength: 400 });
    expect(result.summarizedEntryCount).toBe(2);
    // 长文本被压缩为单行（无换行）并带省略号。
    const line = result.context.split("\n").find((l) => l.startsWith("user:"));
    expect(line).toBeDefined();
    expect(line?.includes("\n") ?? false).toBe(false);
    expect(line?.endsWith("…")).toBe(true);
    expect(line?.length ?? 0).toBeLessThan(140);
  });

  it("摘要超出 maxSummaryLength 时从尾部截断", () => {
    const turns = [];
    for (let i = 0; i < 10; i++) {
      turns.push(entry(`u${i}`, "user", `问题 ${i}`));
      turns.push(entry(`a${i}`, "assistant", `答复 ${i}`));
    }
    const result = buildTextHistorySummary(turns, {
      maxVerbatimTurns: 2,
      maxSummaryLength: 60,
    });
    expect(result.summarizedEntryCount).toBe(18);
    expect(result.context.length).toBeLessThanOrEqual(61);
    expect(result.context.endsWith("…")).toBe(true);
  });

  it("maxVerbatimTurns 为 0 时全部历史进入摘要", () => {
    const turns = [
      entry("u1", "user", "a"),
      entry("a1", "assistant", "b"),
      entry("u2", "user", "c"),
    ];
    const result = buildTextHistorySummary(turns, {
      maxVerbatimTurns: 0,
      maxSummaryLength: 400,
    });
    expect(result.summarizedEntryCount).toBe(3);
    expect(result.context).toContain("user: a");
    expect(result.context).toContain("user: c");
  });

  it("savedTextTokens 等于 full − summary 且非负", () => {
    // 长对话：每轮文本足够长（超出单行截断阈值），压缩后应显著节省 token。
    const longLine = "这是一个很长的对话轮次，包含了大量细节描述、追问和补充说明".repeat(6);
    const turns = [];
    for (let i = 0; i < 8; i++) {
      turns.push(entry(`u${i}`, "user", `${longLine} 用户 ${i}`));
      turns.push(entry(`a${i}`, "assistant", `${longLine} 助手 ${i}`));
    }
    const result = buildTextHistorySummary(turns);
    expect(result.fullTextTokens).toBeGreaterThan(0);
    expect(result.summaryTextTokens).toBeGreaterThan(0);
    expect(result.savedTextTokens).toBe(
      Math.max(0, result.fullTextTokens - result.summaryTextTokens),
    );
    expect(result.savedTextTokens).toBeGreaterThan(0);
  });

  it("远古轮次超过 maxSummaryTurns 时被丢弃并标注", () => {
    // 12 条对话，maxVerbatimTurns=4、maxSummaryTurns=2 → 压缩 8 条、仅保留最旧 2 条。
    const turns = [];
    for (let i = 0; i < 12; i++) {
      turns.push(entry(`u${i}`, "user", `问题 ${i}`));
    }
    const result = buildTextHistorySummary(turns, {
      maxVerbatimTurns: 4,
      maxSummaryLength: 400,
      maxSummaryTurns: 2,
      maxLineLength: 120,
    });
    expect(result.summarizedEntryCount).toBe(8);
    expect(result.context).toContain("已略过最早 6 条");
    // 保留最旧段中最新（最贴近当前）的 2 条（u6 / u7），丢弃更早的 6 条。
    expect(result.context).toContain("问题 6");
    expect(result.context).toContain("问题 7");
    expect(result.context).not.toContain("问题 0");
  });

  it("默认配置导出存在且为正数", () => {
    expect(TEXT_HISTORY_DEFAULT_CONFIG.maxVerbatimTurns).toBeGreaterThan(0);
    expect(TEXT_HISTORY_DEFAULT_CONFIG.maxSummaryLength).toBeGreaterThan(0);
  });
});
