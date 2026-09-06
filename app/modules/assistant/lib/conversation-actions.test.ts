import { describe, expect, it } from "vitest";

import { resolveConversationExport } from "@/modules/assistant/lib/conversation-actions";
import type { TranscriptEntry } from "@/modules/assistant/types";

const EXPORTED_AT = 1_700_000_000_000;

const entries: readonly TranscriptEntry[] = [
  {
    id: "entry-1",
    speaker: "user",
    text: "Hello",
    createdAt: 1_700_000_000_000,
  },
  {
    id: "entry-2",
    speaker: "assistant",
    text: "Hi there",
    createdAt: 1_700_000_001_000,
    deliveryStatus: "sent",
  },
  {
    id: "entry-3",
    speaker: "system",
    text: "Ready",
    createdAt: 1_700_000_002_000,
  },
];

describe("resolveConversationExport", () => {
  it("生成 JSON 导出负载", () => {
    const payload = resolveConversationExport("json", entries, EXPORTED_AT);

    expect(payload.mimeType).toBe("application/json");
    expect(payload.filename).toContain(".json");
    expect(payload.filename).toContain("assistant-conversation-");

    const parsed = JSON.parse(payload.content) as {
      version: number;
      exportedAt: number;
      entries: TranscriptEntry[];
    };

    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe(EXPORTED_AT);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[1].deliveryStatus).toBe("sent");
  });

  it("生成 Markdown 导出负载", () => {
    const payload = resolveConversationExport("md", entries, EXPORTED_AT);

    expect(payload.mimeType).toBe("text/markdown");
    expect(payload.filename).toContain(".md");
    expect(payload.content).toContain("# Conversation Export");
    expect(payload.content).toContain("## User");
    expect(payload.content).toContain("Hello");
    expect(payload.content).toContain("## AI");
    expect(payload.content).toContain("Hi there");
  });

  it("空会话也能生成合法导出", () => {
    const payload = resolveConversationExport("json", [], EXPORTED_AT);
    const parsed = JSON.parse(payload.content) as { entries: unknown[] };

    expect(parsed.entries).toHaveLength(0);
  });

  it("Markdown 空会话给出占位提示", () => {
    const payload = resolveConversationExport("md", [], EXPORTED_AT);
    expect(payload.content).toContain("_No conversation entries._");
  });
});
