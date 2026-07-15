import { describe, expect, it } from "vitest";

import {
  clampSessionWidthPercent,
  defaultWorkspaceLayout,
  parseStoredWorkspaceLayout,
  parseWorkspaceLayout,
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
});
