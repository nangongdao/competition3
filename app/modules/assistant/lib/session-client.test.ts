import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appendSessionMessage,
  createSession,
  deleteSession,
  getSessionWithMessages,
  listSessions,
  renameSession,
} from "./session-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SESSION = {
  id: "session-1",
  title: "新会话",
  providerMode: "chat" as const,
  createdAt: 1000,
  updatedAt: 1000,
  messageCount: 0,
};

describe("session client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a session and returns its summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ success: true, session: SESSION }, 201),
      ),
    );

    const result = await createSession({});

    expect(result).toEqual(SESSION);
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns null when creating a session fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, error: "boom", code: "invalid_request" }, 400),
      ),
    );

    const result = await createSession({});

    expect(result).toBeNull();
  });

  it("lists sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          sessions: [SESSION],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    );

    const result = await listSessions();

    expect(result).toEqual([SESSION]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions?limit=50&offset=0",
      expect.any(Object),
    );
  });

  it("returns empty list when listing fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const result = await listSessions();

    expect(result).toEqual([]);
  });

  it("gets a session with messages", async () => {
    const detail = {
      ...SESSION,
      messages: [{ id: "m1", sessionId: "session-1", role: "user", content: "你好", modality: "text", tokens: null, createdAt: 2000 }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, session: detail })),
    );

    const result = await getSessionWithMessages("session-1");

    expect(result?.messages).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions/session-1",
      expect.any(Object),
    );
  });

  it("returns null when the session is not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ success: false, error: "missing", code: "session_not_found" }, 404),
      ),
    );

    const result = await getSessionWithMessages("nope");

    expect(result).toBeNull();
  });

  it("renames a session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, session: { ...SESSION, title: "新标题" } })),
    );

    const ok = await renameSession("session-1", "新标题");

    expect(ok).toBe(true);
  });

  it("deletes a session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, deleted: true })),
    );

    const ok = await deleteSession("session-1");

    expect(ok).toBe(true);
  });

  it("appends a message", async () => {
    const message = { id: "m1", sessionId: "session-1", role: "user", content: "hi", modality: "text", tokens: null, createdAt: 3000 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, message }, 201)),
    );

    const result = await appendSessionMessage("session-1", { role: "user", content: "hi" });

    expect(result).toEqual(message);
  });
});
