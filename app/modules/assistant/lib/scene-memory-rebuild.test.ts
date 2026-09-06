import { describe, expect, it } from "vitest";

import { buildSceneMemoryFromEntries } from "./scene-memory-rebuild";
import type { SceneMemoryEntry } from "@/modules/assistant/lib/session-client";

function makeEntry(overrides: Partial<SceneMemoryEntry> = {}): SceneMemoryEntry {
  return {
    entryId: "e1",
    summary: "画面中有一只猫",
    recordedAt: 1000,
    frameTokens: 600,
    ...overrides,
  };
}

describe("buildSceneMemoryFromEntries", () => {
  it("returns null when entries is null", () => {
    expect(buildSceneMemoryFromEntries(null, 100)).toBeNull();
  });

  it("returns null when entries is empty", () => {
    expect(buildSceneMemoryFromEntries([], 100)).toBeNull();
  });

  it("rebuilds a single summary entry", () => {
    const state = buildSceneMemoryFromEntries([makeEntry()], 100);

    expect(state).not.toBeNull();
    expect(state?.summaries).toHaveLength(1);
    expect(state?.summaries[0]).toMatchObject({
      id: "e1",
      text: "画面中有一只猫",
      recordedAt: 1000,
      frameTokens: 600,
    });
  });

  it("fills recordedAt with Date.now when missing", () => {
    const before = Date.now();
    const state = buildSceneMemoryFromEntries([makeEntry({ recordedAt: undefined })], 100);
    const after = Date.now();

    expect(state?.summaries[0].recordedAt).toBeGreaterThanOrEqual(before);
    expect(state?.summaries[0].recordedAt).toBeLessThanOrEqual(after);
  });

  it("uses fallback frame tokens when entry has none", () => {
    const state = buildSceneMemoryFromEntries(
      [makeEntry({ frameTokens: undefined })],
      456,
    );

    expect(state?.summaries[0].frameTokens).toBe(456);
  });

  it("preserves explicit frame tokens over the fallback", () => {
    const state = buildSceneMemoryFromEntries([makeEntry({ frameTokens: 999 })], 456);

    expect(state?.summaries[0].frameTokens).toBe(999);
  });

  it("merges multiple entries into one state", () => {
    const state = buildSceneMemoryFromEntries(
      [
        makeEntry({ entryId: "e1", summary: "第一帧" }),
        makeEntry({ entryId: "e2", summary: "第二帧" }),
      ],
      100,
    );

    expect(state?.summaries.map((s) => s.id)).toEqual(["e1", "e2"]);
  });
});
