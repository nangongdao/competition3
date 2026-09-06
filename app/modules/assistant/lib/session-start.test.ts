import { describe, expect, it } from "vitest";

import {
  resolveSessionStart,
  resolveBlockedPhase,
} from "@/modules/assistant/lib/session-start";

describe("resolveSessionStart", () => {
  it("Chat 模式下拒绝启动（无需启动 Realtime）", () => {
    expect(
      resolveSessionStart({ isChatMode: true, mediaGranted: true }),
    ).toEqual({ kind: "blocked-chat-mode" });
  });

  it("Chat 模式且媒体未授权也返回 blocked-chat-mode（Chat 优先）", () => {
    expect(
      resolveSessionStart({ isChatMode: true, mediaGranted: false }),
    ).toEqual({ kind: "blocked-chat-mode" });
  });

  it("Realtime 模式且媒体已授权时放行", () => {
    expect(
      resolveSessionStart({ isChatMode: false, mediaGranted: true }),
    ).toEqual({ kind: "proceed" });
  });

  it("Realtime 模式但媒体未授权时拒绝并提示", () => {
    expect(
      resolveSessionStart({ isChatMode: false, mediaGranted: false }),
    ).toEqual({ kind: "blocked-no-media" });
  });
});

describe("resolveBlockedPhase", () => {
  it("媒体未授权时进入 error 态", () => {
    expect(resolveBlockedPhase({ kind: "blocked-no-media" })).toBe("error");
  });

  it("Chat 模式拒绝时不改变 phase", () => {
    expect(resolveBlockedPhase({ kind: "blocked-chat-mode" })).toBeNull();
  });
});
