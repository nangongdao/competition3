import { describe, expect, it } from "vitest";

import { mapMessageToTranscriptEntry } from "./use-sessions";
import type { SessionMessage } from "@/modules/assistant/lib/session-client";

function makeMessage(overrides: Partial<SessionMessage> = {}): SessionMessage {
  return {
    id: "m1",
    sessionId: "s1",
    role: "user",
    content: "你好",
    modality: "text",
    tokens: null,
    createdAt: 1000,
    ...overrides,
  };
}

describe("mapMessageToTranscriptEntry", () => {
  it("maps a user message to a user transcript entry", () => {
    const entry = mapMessageToTranscriptEntry(makeMessage({ role: "user", content: "你好" }), "entry-1");

    expect(entry).toEqual({
      id: "entry-1",
      speaker: "user",
      text: "你好",
      createdAt: 1000,
      deliveryStatus: "sent",
    });
  });

  it("maps an assistant message to an assistant transcript entry", () => {
    const entry = mapMessageToTranscriptEntry(makeMessage({ role: "assistant", content: "你好！" }), "entry-2");

    expect(entry.speaker).toBe("assistant");
    expect(entry.text).toBe("你好！");
    expect(entry.deliveryStatus).toBe("sent");
  });

  it("maps a system message to an assistant transcript entry (fallback)", () => {
    const entry = mapMessageToTranscriptEntry(makeMessage({ role: "system", content: "系统消息" }), "entry-3");

    expect(entry.speaker).toBe("assistant");
    expect(entry.text).toBe("系统消息");
  });

  it("preserves createdAt timestamp", () => {
    const entry = mapMessageToTranscriptEntry(makeMessage({ createdAt: 12345 }), "entry-4");

    expect(entry.createdAt).toBe(12345);
  });
});
