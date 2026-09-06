import { describe, expect, it } from "vitest";

import {
  defaultThemePreference,
  isDarkSchemeMediaQuery,
  isThemePreference,
  parseStoredThemePreference,
  parseThemePreference,
  resolveThemeMode,
  THEME_STORAGE_KEY,
} from "@/modules/assistant/lib/theme";

describe("theme preference (M2.2)", () => {
  it("uses the default for missing or malformed storage", () => {
    expect(parseStoredThemePreference(null)).toBe("system");
    expect(parseStoredThemePreference("not-json")).toBe("system");
    expect(parseStoredThemePreference('"unknown"')).toBe("system");
  });

  it("parses stored and raw preferences safely", () => {
    expect(parseStoredThemePreference('"dark"')).toBe("dark");
    expect(parseStoredThemePreference('"light"')).toBe("light");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference(42)).toBe(defaultThemePreference);
  });

  it("guards valid preferences via schema", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
  });

  it("resolves the applied mode from preference + system theme", () => {
    expect(resolveThemeMode("system", "dark")).toBe("dark");
    expect(resolveThemeMode("system", "light")).toBe("light");
    expect(resolveThemeMode("light", "dark")).toBe("light");
    expect(resolveThemeMode("dark", "light")).toBe("dark");
  });

  it("exposes the storage key and dark scheme query detection", () => {
    expect(THEME_STORAGE_KEY).toMatch(/^assistant-theme-preference-v1$/);
    expect(isDarkSchemeMediaQuery("(prefers-color-scheme: dark)")).toBe(true);
    expect(isDarkSchemeMediaQuery("(min-width: 768px)")).toBe(false);
  });
});
