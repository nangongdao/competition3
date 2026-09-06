import { beforeEach, describe, expect, it } from "vitest";

import {
  LANGUAGE_STORAGE_KEY,
  persistLanguage,
  resolveInitialLanguage,
  SUPPORTED_LANGUAGES,
} from "@/i18n";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";

/**
 * i18n 语言解析 / 持久化 与 中英资源一致性测试（M3.4）。
 *
 * 由于 vitest 默认 node 环境无完整 DOM，这里手工构造一个带
 * localStorage 与 navigator 的最小 window stub。
 */

type MockWindow = {
  localStorage: Storage;
  navigator: { language: string };
};

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  };
}

function setupWindow(lang: string): MockWindow {
  const win: MockWindow = {
    localStorage: makeStorage(),
    navigator: { language: lang },
  };
  globalThis.window = win as unknown as Window & typeof globalThis;
  return win;
}

describe("resolveInitialLanguage (M3.4)", () => {
  beforeEach(() => {
    setupWindow("zh-CN");
  });

  it("falls back to zh when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error intentionally delete for test
    delete globalThis.window;
    try {
      expect(resolveInitialLanguage()).toBe("zh");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("prefers a stored language choice", () => {
    globalThis.window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(resolveInitialLanguage()).toBe("en");

    globalThis.window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");
    expect(resolveInitialLanguage()).toBe("zh");
  });

  it("ignores invalid stored values and falls through", () => {
    globalThis.window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(resolveInitialLanguage()).toBe("zh");
  });

  it("follows a Chinese navigator language by default", () => {
    expect(resolveInitialLanguage()).toBe("zh");
  });

  it("defaults to en for non-Chinese navigator languages", () => {
    setupWindow("en-US");
    expect(resolveInitialLanguage()).toBe("en");
  });
});

describe("persistLanguage (M3.4)", () => {
  beforeEach(() => {
    setupWindow("zh-CN");
  });

  it("writes the selected language to localStorage", () => {
    persistLanguage("en");
    expect(globalThis.window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    persistLanguage("zh");
    expect(globalThis.window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
  });

  it("does not throw when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error intentionally delete for test
    delete globalThis.window;
    try {
      expect(() => persistLanguage("en")).not.toThrow();
    } finally {
      globalThis.window = originalWindow;
    }
  });
});

describe("i18n resource consistency (M3.4)", () => {
  it("declares the same supported languages in code and resources", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["zh", "en"]);
    expect(Object.keys(zh).length).toBeGreaterThan(0);
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  it("keeps zh and en translation key trees identical", () => {
    const flatten = (
      obj: Record<string, unknown>,
      prefix = "",
    ): string[] =>
      Object.entries(obj).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object") {
          return flatten(value as Record<string, unknown>, path);
        }
        return [path];
      });

    expect(flatten(en as Record<string, unknown>).sort()).toEqual(
      flatten(zh as Record<string, unknown>).sort(),
    );
  });
});
