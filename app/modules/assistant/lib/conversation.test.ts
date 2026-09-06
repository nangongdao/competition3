import { describe, expect, it } from "vitest";

import {
  createConversationExportFilename,
  getNextTranscriptVisibleCount,
  getVisibleTranscriptEntries,
  isChatTurnRetryAllowed,
  serializeConversationJson,
  serializeConversationMarkdown,
  TRANSCRIPT_ESTIMATED_ROW_SIZE,
  TRANSCRIPT_ROW_GAP,
  TRANSCRIPT_VIRTUAL_OVERSCAN,
} from "@/modules/assistant/lib/conversation";
import type { TranscriptEntry } from "@/modules/assistant/types";

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
    text: "Network unavailable",
    createdAt: 1_700_000_002_000,
    deliveryStatus: "failed",
  },
] as const;

describe("conversation transcript windowing", () => {
  it("returns only the newest requested entries", () => {
    expect(getVisibleTranscriptEntries(entries, 2)).toEqual(entries.slice(1));
  });

  it("grows the window without exceeding the total", () => {
    expect(getNextTranscriptVisibleCount(40, 100, 30)).toBe(70);
    expect(getNextTranscriptVisibleCount(70, 80, 30)).toBe(80);
  });
});

describe("conversation virtualization config (M2.4)", () => {
  it("keeps a positive estimated row size that accommodates a text entry plus gap", () => {
    expect(TRANSCRIPT_ESTIMATED_ROW_SIZE).toBeGreaterThan(TRANSCRIPT_ROW_GAP);
    expect(TRANSCRIPT_ESTIMATED_ROW_SIZE).toBeGreaterThan(0);
  });

  it("uses a sane overscan to avoid scroll blanking without over-rendering", () => {
    expect(TRANSCRIPT_VIRTUAL_OVERSCAN).toBeGreaterThanOrEqual(3);
    expect(TRANSCRIPT_VIRTUAL_OVERSCAN).toBeLessThanOrEqual(12);
  });
});

describe("conversation retry rules", () => {
  it("allows retry only for retained failures while Chat is idle", () => {
    expect(isChatTurnRetryAllowed(true, false)).toBe(true);
    expect(isChatTurnRetryAllowed(false, false)).toBe(false);
    expect(isChatTurnRetryAllowed(true, true)).toBe(false);
  });
});

describe("conversation exports", () => {
  it("serializes a stable privacy-limited JSON document", () => {
    const value = JSON.parse(
      serializeConversationJson(entries, 1_700_000_010_000),
    ) as {
      version: number;
      entries: readonly Record<string, unknown>[];
    };

    expect(value.version).toBe(1);
    expect(value.entries).toHaveLength(3);
    expect(value.entries[0]).toEqual(entries[0]);
    expect(JSON.stringify(value)).not.toContain("imageDataUrl");
    expect(JSON.stringify(value)).not.toContain("instructions");
  });

  it("serializes readable Markdown and supports an empty export", () => {
    const markdown = serializeConversationMarkdown(entries, 1_700_000_010_000);
    expect(markdown).toContain("# Conversation Export");
    expect(markdown).toContain("## User");
    expect(markdown).toContain("Hello");
    expect(serializeConversationMarkdown([], 1_700_000_010_000)).toContain(
      "No conversation entries",
    );
  });

  it("creates filesystem-safe ISO filenames", () => {
    const filename = createConversationExportFilename(
      1_700_000_010_000,
      "json",
    );
    expect(filename).toMatch(/^assistant-conversation-.*\.json$/);
    expect(filename).not.toContain(":");
  });
});
