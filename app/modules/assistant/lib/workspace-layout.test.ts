import { describe, expect, it } from "vitest";

import {
  clampSessionWidthPercent,
  defaultWorkspaceLayout,
  parseStoredWorkspaceLayout,
  parseWorkspaceLayout,
  resolveSessionWidthFromPointer,
  swapWorkspacePanels,
} from "@/modules/assistant/lib/workspace-layout";

describe("workspace layout", () => {
  it("uses the default for missing or malformed storage", () => {
    expect(parseStoredWorkspaceLayout(null)).toEqual(defaultWorkspaceLayout);
    expect(parseStoredWorkspaceLayout("not-json")).toEqual(defaultWorkspaceLayout);
  });

  it("rejects duplicate panel order and unsupported versions", () => {
    expect(
      parseWorkspaceLayout({
        ...defaultWorkspaceLayout,
        panelOrder: ["session", "session"],
      }),
    ).toEqual(defaultWorkspaceLayout);
    expect(
      parseWorkspaceLayout({ ...defaultWorkspaceLayout, version: 2 }),
    ).toEqual(defaultWorkspaceLayout);
  });

  it("clamps resizing and swaps panels deterministically", () => {
    expect(clampSessionWidthPercent(12)).toBe(28);
    expect(clampSessionWidthPercent(43.6)).toBe(44);
    expect(clampSessionWidthPercent(90)).toBe(55);
    expect(swapWorkspacePanels(["session", "vision"])).toEqual([
      "vision",
      "session",
    ]);
  });

  it("resolves session width as pointer percent when session panel is first", () => {
    const bounds = { left: 0, width: 1000 };
    expect(resolveSessionWidthFromPointer(300, bounds, ["session", "vision"])).toBe(30);
  });

  it("resolves session width mirrored when vision panel is first", () => {
    const bounds = { left: 0, width: 1000 };
    expect(resolveSessionWidthFromPointer(300, bounds, ["vision", "session"])).toBe(70);
  });

  it("accounts for the container left offset", () => {
    const bounds = { left: 200, width: 1000 };
    expect(resolveSessionWidthFromPointer(500, bounds, ["session", "vision"])).toBe(30);
  });
});
