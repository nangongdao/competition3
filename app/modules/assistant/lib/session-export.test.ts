import { describe, expect, it } from "vitest";

import {
  createSessionExportFilename,
  serializeSessionJson,
  serializeSessionMarkdown,
} from "./session-export";
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

describe("serializeSessionMarkdown", () => {
  it("writes header with title, session id and export timestamp", () => {
    const text = serializeSessionMarkdown("s1", "我的会话", [], 1000);

    expect(text).toContain("# Session Export");
    expect(text).toContain("Title: 我的会话");
    expect(text).toContain("Session: s1");
    expect(text).toContain("Exported: 1970-01-01T00:00:01.000Z");
  });

  it("marks an empty session with a no-messages note", () => {
    const text = serializeSessionMarkdown("s1", "空会话", [], 1000);

    expect(text).toContain("_No messages in this session._");
  });

  it("labels user and assistant roles with timestamps", () => {
    const messages = [
      makeMessage({ id: "m1", role: "user", content: "你好", createdAt: 1000 }),
      makeMessage({
        id: "m2",
        role: "assistant",
        content: "你好！",
        modality: "text",
        createdAt: 2000,
      }),
    ];

    const text = serializeSessionMarkdown("s1", "会话", messages, 1000);

    expect(text).toContain("## User · 1970-01-01T00:00:01.000Z");
    expect(text).toContain("## AI · 1970-01-01T00:00:02.000Z");
    expect(text).toContain("你好");
    expect(text).toContain("你好！");
  });
});

describe("serializeSessionJson", () => {
  it("serializes messages with full metadata", () => {
    const messages = [
      makeMessage({
        id: "m1",
        role: "user",
        content: "你好",
        modality: "text",
        createdAt: 1000,
      }),
      makeMessage({
        id: "m2",
        role: "assistant",
        content: "你好！",
        modality: "text",
        tokens: 12,
        createdAt: 2000,
      }),
    ];

    const json = serializeSessionJson("s1", "会话", messages, 3000);
    const parsed = JSON.parse(json) as {
      version: number;
      sessionId: string;
      title: string;
      exportedAt: number;
      messages: { id: string; role: string; content: string }[];
    };

    expect(parsed.version).toBe(1);
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.title).toBe("会话");
    expect(parsed.exportedAt).toBe(3000);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe("user");
    expect(parsed.messages[1].content).toBe("你好！");
  });
});

describe("createSessionExportFilename", () => {
  it("creates a json filename with ISO timestamp", () => {
    const filename = createSessionExportFilename(1000, "json");

    expect(filename).toMatch(/^session-export-.*\.json$/);
    expect(filename).toContain("session-export-");
  });

  it("creates a markdown filename", () => {
    const filename = createSessionExportFilename(1000, "md");

    expect(filename).toMatch(/\.md$/);
  });
});
