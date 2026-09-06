import { describe, expect, it } from "vitest";

import {
  buildRestoredTranscriptEntries,
  buildSceneMemoryState,
} from "@/modules/assistant/lib/session-restore";
import { MAX_FRAME_WIDTH } from "@/modules/assistant/lib/frame-processing";
import { estimateImageTokens } from "@/modules/assistant/lib/cost-model";
import type { SessionMessage } from "@/modules/assistant/lib/session-client";
import type { SceneMemoryEntry } from "@/modules/assistant/lib/session-client";

describe("buildRestoredTranscriptEntries", () => {
  const messages: readonly SessionMessage[] = [
    {
      id: "msg-1",
      sessionId: "s1",
      role: "user",
      content: "你好",
      modality: "text",
      tokens: 3,
      createdAt: 1000,
    },
    {
      id: "msg-2",
      sessionId: "s1",
      role: "assistant",
      content: "你好！",
      modality: "text",
      tokens: 4,
      createdAt: 2000,
    },
  ];

  it("从指定 nextId 起递增生成转写条目 id", () => {
    const result = buildRestoredTranscriptEntries(messages, 5);
    expect(result.entries.map((entry) => entry.id)).toEqual([
      "entry-5",
      "entry-6",
    ]);
    expect(result.nextId).toBe(7);
  });

  it("按角色映射 speaker（user→user，assistant→assistant）并标记 sent", () => {
    const { entries } = buildRestoredTranscriptEntries(messages, 0);
    expect(entries[0]).toMatchObject({
      id: "entry-0",
      speaker: "user",
      text: "你好",
      createdAt: 1000,
      deliveryStatus: "sent",
    });
    expect(entries[1]).toMatchObject({
      id: "entry-1",
      speaker: "assistant",
      text: "你好！",
      createdAt: 2000,
      deliveryStatus: "sent",
    });
  });

  it("空消息 → 空条目，nextId 不变", () => {
    const result = buildRestoredTranscriptEntries([], 9);
    expect(result.entries).toEqual([]);
    expect(result.nextId).toBe(9);
  });

  it("依次消费 nextId，不与其他转换互相影响", () => {
    const first = buildRestoredTranscriptEntries(messages, 3);
    const second = buildRestoredTranscriptEntries(messages, first.nextId);
    expect(second.entries.map((entry) => entry.id)).toEqual([
      "entry-5",
      "entry-6",
    ]);
  });
});

describe("buildSceneMemoryState", () => {
  it("空条目 → 空场景记忆", () => {
    expect(buildSceneMemoryState([]).summaries).toEqual([]);
  });

  it("条目带 recordedAt/frameTokens → 原样保留", () => {
    const entries: readonly SceneMemoryEntry[] = [
      {
        entryId: "frame-1",
        summary: "桌上有水杯",
        recordedAt: 12345,
        frameTokens: 99,
      },
    ];
    expect(buildSceneMemoryState(entries).summaries).toEqual([
      { id: "frame-1", text: "桌上有水杯", recordedAt: 12345, frameTokens: 99 },
    ]);
  });

  it("缺省 frameTokens → 用估算 token 兜底", () => {
    const entries: readonly SceneMemoryEntry[] = [
      {
        entryId: "frame-1",
        summary: "桌面",
      },
    ];
    const expectedTokens = estimateImageTokens(
      MAX_FRAME_WIDTH,
      Math.round(MAX_FRAME_WIDTH * (9 / 16)),
    );
    const summaries = buildSceneMemoryState(entries).summaries;
    expect(summaries[0].frameTokens).toBe(expectedTokens);
    // recordedAt 缺省用当前时间兜底（应为一个有效时间戳）。
    expect(typeof summaries[0].recordedAt).toBe("number");
  });

  it("缺省 recordedAt → 用当前时间兜底（近似现在）", () => {
    const before = Date.now();
    const entries: readonly SceneMemoryEntry[] = [
      { entryId: "frame-1", summary: "场景" },
    ];
    const recordedAt = buildSceneMemoryState(entries).summaries[0].recordedAt;
    expect(recordedAt).toBeGreaterThanOrEqual(before);
    expect(recordedAt).toBeLessThanOrEqual(Date.now());
  });

  it("多条条目按顺序累积，超出上限丢弃最旧", () => {
    const entries: readonly SceneMemoryEntry[] = [
      { entryId: "frame-1", summary: "A" },
      { entryId: "frame-2", summary: "B" },
      { entryId: "frame-3", summary: "C" },
      { entryId: "frame-4", summary: "D" },
      { entryId: "frame-5", summary: "E" },
    ];
    const ids = buildSceneMemoryState(entries).summaries.map((s) => s.id);
    // 默认 maxSummaries = 4，超出丢弃最旧。
    expect(ids).toEqual(["frame-2", "frame-3", "frame-4", "frame-5"]);
  });
});
