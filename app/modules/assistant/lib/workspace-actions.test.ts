import { describe, expect, it } from "vitest";

import {
  resolveProviderModeChange,
  resolveStopSessionActions,
} from "@/modules/assistant/lib/workspace-actions";

describe("resolveStopSessionActions", () => {
  it("会话激活过且媒体已授权 → 记录提示 + 复位到 ready", () => {
    expect(
      resolveStopSessionActions({
        hasActiveSession: true,
        hasRealtimeConnection: false,
        mediaGranted: true,
      }),
    ).toEqual([{ kind: "log-stopped" }, { kind: "phase-set", phase: "ready" }]);
  });

  it("存在 Realtime 连接 → 记录提示 + 复位", () => {
    expect(
      resolveStopSessionActions({
        hasActiveSession: false,
        hasRealtimeConnection: true,
        mediaGranted: false,
      }),
    ).toEqual([{ kind: "log-stopped" }, { kind: "phase-set", phase: "idle" }]);
  });

  it("会话未激活且无连接 → 不记录提示，仍复位阶段", () => {
    expect(
      resolveStopSessionActions({
        hasActiveSession: false,
        hasRealtimeConnection: false,
        mediaGranted: true,
      }),
    ).toEqual([{ kind: "phase-set", phase: "ready" }]);
  });

  it("媒体未授权 → 复位到 idle", () => {
    expect(
      resolveStopSessionActions({
        hasActiveSession: true,
        hasRealtimeConnection: false,
        mediaGranted: false,
      }),
    ).toEqual([{ kind: "log-stopped" }, { kind: "phase-set", phase: "idle" }]);
  });
});

describe("resolveProviderModeChange", () => {
  it("合法值 chat 且不同于当前 → set-mode", () => {
    expect(resolveProviderModeChange("chat", "realtime")).toEqual({
      kind: "set-mode",
      next: "chat",
    });
  });

  it("合法值 realtime 且不同于当前 → set-mode", () => {
    expect(resolveProviderModeChange("realtime", "chat")).toEqual({
      kind: "set-mode",
      next: "realtime",
    });
  });

  it("非法值 → noop", () => {
    expect(resolveProviderModeChange("bogus", "chat")).toEqual({ kind: "noop" });
    expect(resolveProviderModeChange("", "chat")).toEqual({ kind: "noop" });
  });

  it("与当前相同 → noop", () => {
    expect(resolveProviderModeChange("chat", "chat")).toEqual({ kind: "noop" });
  });
});
