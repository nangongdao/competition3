import { afterEach, describe, expect, it } from "vitest";
import { isTauriRuntime } from "./use-tauri";

const originalWindow = globalThis.window;

function mockWindow(internals: boolean): void {
  const win = internals
    ? ({ __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis)
    : ({} as Window & typeof globalThis);
  Object.defineProperty(globalThis, "window", {
    value: win,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("isTauriRuntime", () => {
  it("在无 window 的环境（SSR）返回 false", () => {
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(isTauriRuntime()).toBe(false);
  });

  it("在普通浏览器（无 __TAURI_INTERNALS__）返回 false", () => {
    mockWindow(false);
    expect(isTauriRuntime()).toBe(false);
  });

  it("在 Tauri 运行时（含 __TAURI_INTERNALS__）返回 true", () => {
    mockWindow(true);
    expect(isTauriRuntime()).toBe(true);
  });
});
