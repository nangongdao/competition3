import { describe, expect, it } from "vitest";

import {
  appendChatUsageTurn,
  CHAT_PRICES_USD_PER_MILLION,
  chatTurnToUsageBuckets,
  chatUsageToUsageReport,
  createEmptyChatUsageAsUsageReport,
  createEmptyChatUsageReport,
  estimateChatTurnCost,
  estimateChatTurnCostFromUsage,
  estimateTextTokens,
  type ChatTurnEstimateInput,
} from "./chat-cost-model";

function sampleTurn(
  overrides: Partial<ChatTurnEstimateInput> = {},
): ChatTurnEstimateInput {
  return {
    message: "这是一个中文测试问题",
    answer: "这是一个中文回答",
    ...overrides,
  };
}

describe("estimateTextTokens", () => {
  it("returns 0 for empty or non-string-ish input", () => {
    expect(estimateTextTokens("")).toBe(0);
  });

  it("estimates at least 1 token for any non-empty text", () => {
    expect(estimateTextTokens("a")).toBe(1);
  });

  it("scales with characters at ~4 chars/token", () => {
    expect(estimateTextTokens("a".repeat(8))).toBe(2);
    expect(estimateTextTokens("a".repeat(9))).toBe(3);
  });
});

describe("estimateChatTurnCost", () => {
  it("estimates a plain text turn with no image", () => {
    const estimate = estimateChatTurnCost(sampleTurn());

    expect(estimate.inputImageTokens).toBe(0);
    expect(estimate.inputTextTokens).toBeGreaterThan(0);
    expect(estimate.outputTextTokens).toBeGreaterThan(0);
    expect(estimate.inputTokens).toBe(estimate.inputTextTokens);
    expect(estimate.outputTokens).toBe(estimate.outputTextTokens);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("adds scene + history context text to input tokens", () => {
    const without = estimateChatTurnCost(sampleTurn());
    const withContext = estimateChatTurnCost(
      sampleTurn({
        sceneContext: "场景记忆摘要内容".repeat(10),
        historyContext: "历史摘要内容".repeat(10),
      }),
    );

    expect(withContext.inputTextTokens).toBeGreaterThan(without.inputTextTokens);
  });

  it("adds image tokens when a data URL + valid dimensions are provided", () => {
    const estimate = estimateChatTurnCost(
      sampleTurn({
        imageDataUrl: "data:image/jpeg;base64,xxxx",
        frameWidth: 640,
        frameHeight: 360,
      }),
    );

    expect(estimate.inputImageTokens).toBeGreaterThan(0);
    expect(estimate.inputTokens).toBe(
      estimate.inputTextTokens + estimate.inputImageTokens,
    );
  });

  it("ignores image when dimensions are missing or invalid", () => {
    const estimate = estimateChatTurnCost(
      sampleTurn({
        imageDataUrl: "data:image/jpeg;base64,xxxx",
      }),
    );

    expect(estimate.inputImageTokens).toBe(0);
  });

  it("computes cost from the price table at per-million scale", () => {
    const estimate = estimateChatTurnCost(sampleTurn());
    const prices = CHAT_PRICES_USD_PER_MILLION;
    const expected =
      (estimate.inputTextTokens * prices.inputText +
        estimate.outputTextTokens * prices.outputText) /
      1_000_000;

    expect(estimate.estimatedCostUsd).toBeCloseTo(expected, 10);
  });
});

describe("estimateChatTurnCostFromUsage", () => {
  it("falls back to the heuristic estimate when no usage is provided", () => {
    const input = sampleTurn();
    const fromUsage = estimateChatTurnCostFromUsage(input);
    const estimate = estimateChatTurnCost(input);

    expect(fromUsage).toEqual(estimate);
  });

  it("uses authoritative prompt/completion tokens for text when usage is provided", () => {
    const input = sampleTurn({
      imageDataUrl: "data:image/jpeg;base64,x",
      frameWidth: 640,
      frameHeight: 360,
      usage: {
        promptTokens: 2000,
        completionTokens: 120,
        totalTokens: 2120,
      },
    });
    const estimate = estimateChatTurnCostFromUsage(input);

    // 图像 token 保持估算；文本 token 被权威 prompt 总量校正。
    expect(estimate.inputImageTokens).toBe(estimateChatTurnCost(input).inputImageTokens);
    expect(estimate.inputTextTokens).toBe(2000 - estimate.inputImageTokens);
    expect(estimate.inputTokens).toBe(2000);
    expect(estimate.outputTextTokens).toBe(120);
    expect(estimate.outputTokens).toBe(120);
  });

  it("recomputes cost from the authoritative token split", () => {
    const input = sampleTurn({
      usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
    });
    const estimate = estimateChatTurnCostFromUsage(input);
    const prices = CHAT_PRICES_USD_PER_MILLION;
    const expected =
      (1000 * prices.inputText + 200 * prices.outputText) / 1_000_000;

    expect(estimate.estimatedCostUsd).toBeCloseTo(expected, 10);
  });

  it("clamps invalid usage counts to non-negative values", () => {
    const estimate = estimateChatTurnCostFromUsage(
      sampleTurn({
        usage: { promptTokens: -5, completionTokens: 0, totalTokens: -5 },
      }),
    );

    expect(estimate.inputTokens).toBe(0);
    expect(estimate.outputTokens).toBe(0);
  });
});

describe("appendChatUsageTurn", () => {
  it("folds a turn into an empty report and updates cumulative cost", () => {
    const report = createEmptyChatUsageReport();
    const estimate = estimateChatTurnCost(sampleTurn());
    const next = appendChatUsageTurn(report, estimate, 123);

    expect(next.turnCount).toBe(1);
    expect(next.turns).toHaveLength(1);
    expect(next.lastTurn).not.toBeNull();
    expect(next.lastTurn?.index).toBe(1);
    expect(next.lastTurn?.recordedAt).toBe(123);
    expect(next.estimatedCostUsd).toBeCloseTo(
      estimate.estimatedCostUsd,
      10,
    );
    expect(next.lastTurn?.cumulativeEstimatedCostUsd).toBe(
      next.estimatedCostUsd,
    );
    expect(next.totals.inputTokens).toBe(estimate.inputTokens);
    expect(next.totals.outputTokens).toBe(estimate.outputTokens);
  });

  it("accumulates totals and cumulative cost across turns", () => {
    let report = createEmptyChatUsageReport();
    const estimateA = estimateChatTurnCost(sampleTurn());
    const estimateB = estimateChatTurnCost(
      sampleTurn({ message: "第二轮问题内容", answer: "第二轮回答内容" }),
    );

    report = appendChatUsageTurn(report, estimateA, 1);
    report = appendChatUsageTurn(report, estimateB, 2);

    expect(report.turnCount).toBe(2);
    expect(report.turns).toHaveLength(2);
    expect(report.totals.inputTokens).toBe(
      estimateA.inputTokens + estimateB.inputTokens,
    );
    expect(report.estimatedCostUsd).toBeCloseTo(
      estimateA.estimatedCostUsd + estimateB.estimatedCostUsd,
      10,
    );
    expect(report.lastTurn?.index).toBe(2);
  });
});

describe("chatUsageToUsageReport / chatTurnToUsageBuckets", () => {
  it("maps an empty chat report onto an empty UsageReport", () => {
    const mapped = chatUsageToUsageReport(createEmptyChatUsageReport());
    const empty = createEmptyChatUsageAsUsageReport();

    expect(mapped.turnCount).toBe(0);
    expect(mapped.estimatedCostUsd).toBe(0);
    expect(mapped.lastTurn).toBeNull();
    expect(mapped.turns).toHaveLength(0);
    expect(mapped.totals).toEqual(empty.totals);
  });

  it("maps a populated chat report preserving buckets and cumulative cost", () => {
    let report = createEmptyChatUsageReport();
    report = appendChatUsageTurn(
      report,
      estimateChatTurnCost(
        sampleTurn({
          imageDataUrl: "data:image/jpeg;base64,x",
          frameWidth: 640,
          frameHeight: 360,
        }),
      ),
      1,
    );
    const mapped = chatUsageToUsageReport(report);

    expect(mapped.turnCount).toBe(1);
    expect(mapped.estimatedCostUsd).toBe(report.estimatedCostUsd);
    const lastTurn = report.lastTurn;

    if (lastTurn === null) {
      throw new Error("expected report to have a last turn");
    }
    expect(mapped.lastTurn).toEqual(chatTurnToUsageBuckets(lastTurn));
    expect(mapped.turns).toHaveLength(1);
    expect(mapped.totals.inputImageTokens).toBe(
      report.totals.inputImageTokens,
    );
    expect(mapped.totals.inputAudioTokens).toBe(0);
    expect(mapped.totals.outputAudioTokens).toBe(0);
    expect(mapped.totals.cachedInputTokens).toBe(0);
  });
});
