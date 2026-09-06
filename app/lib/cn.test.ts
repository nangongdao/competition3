import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins string tokens", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters falsy values", () => {
    expect(cn("a", undefined, null, false, "", "b")).toBe("a b");
  });

  it("handles nested arrays", () => {
    expect(cn("a", ["b", ["c", "d"]], "e")).toBe("a b c d e");
  });

  it("handles conditional object-style usage", () => {
    const active = true;
    const disabled = false;
    expect(cn("base", active && "active", disabled && "disabled")).toBe(
      "base active",
    );
  });

  it("accepts numbers", () => {
    expect(cn("p", 2)).toBe("p 2");
  });

  it("returns empty string for no valid values", () => {
    expect(cn(undefined, null, false)).toBe("");
  });
});
