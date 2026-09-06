import { describe, expect, it } from "vitest";

import { buildInitialTranscript } from "./workspace-shell";

describe("buildInitialTranscript", () => {
  it("returns a system-ready entry followed by an assistant greeting", () => {
    const entries = buildInitialTranscript(1_700_000_000_000);

    expect(entries).toHaveLength(2);
    expect(entries[0].speaker).toBe("system");
    expect(entries[0].text).toContain("系统已就绪");
    expect(entries[1].speaker).toBe("assistant");
    expect(entries[1].text).toContain("Chat Completions");
  });

  it("uses ascending ids from entry-0", () => {
    const entries = buildInitialTranscript();

    expect(entries.map((e) => e.id)).toEqual(["entry-0", "entry-1"]);
  });

  it("uses the provided timestamp for createdAt", () => {
    const now = 1_720_000_000_000;
    const entries = buildInitialTranscript(now);

    expect(entries.every((e) => e.createdAt === now)).toBe(true);
  });

  it("defaults createdAt to the current time when omitted", () => {
    const before = Date.now();
    const entries = buildInitialTranscript();
    const after = Date.now();

    expect(entries[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(entries[0].createdAt).toBeLessThanOrEqual(after);
  });
});
