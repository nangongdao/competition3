import { describe, expect, it } from "vitest";

import type {
  AssistantPhase,
  MediaPermissionStatus,
} from "@/modules/assistant/types";

import { resolveMediaPhaseSync } from "./media-phase-sync";

const PHASES: readonly AssistantPhase[] = [
  "idle",
  "ready",
  "connecting",
  "listening",
  "thinking",
  "responding",
  "error",
];

describe("resolveMediaPhaseSync", () => {
  it("granted + idle → 推进到 ready", () => {
    expect(resolveMediaPhaseSync("granted", "idle")).toEqual({
      kind: "set-phase",
      phase: "ready",
    });
  });

  it("granted + 非 idle → noop（避免重复置位）", () => {
    for (const phase of PHASES) {
      if (phase === "idle") {
        continue;
      }

      expect(resolveMediaPhaseSync("granted", phase)).toEqual({ kind: "noop" });
    }
  });

  it("requesting → noop（授权进行中不干预相位）", () => {
    for (const phase of PHASES) {
      expect(resolveMediaPhaseSync("requesting", phase)).toEqual({
        kind: "noop",
      });
    }
  });

  it("非 requesting 且非 idle → 回退到 idle", () => {
    for (const status of ["denied", "unsupported", "error"] as const) {
      for (const phase of PHASES) {
        if (phase === "idle") {
          continue;
        }

        expect(resolveMediaPhaseSync(status, phase)).toEqual({
          kind: "set-phase",
          phase: "idle",
        });
      }
    }
  });

  it("非 requesting 且已 idle → noop", () => {
    for (const status of ["idle", "denied", "unsupported", "error"] as const) {
      expect(resolveMediaPhaseSync(status, "idle")).toEqual({ kind: "noop" });
    }
  });

  it("覆盖所有 MediaPermissionStatus 组合不抛错", () => {
    const statuses: readonly MediaPermissionStatus[] = [
      "idle",
      "requesting",
      "granted",
      "denied",
      "unsupported",
      "error",
    ];

    for (const status of statuses) {
      for (const phase of PHASES) {
        const result = resolveMediaPhaseSync(status, phase);

        if (result.kind === "set-phase") {
          expect(["ready", "idle"]).toContain(result.phase);
        } else {
          expect(result.kind).toBe("noop");
        }
      }
    }
  });
});
