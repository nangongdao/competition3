import { describe, expect, it } from "vitest";

import {
  isOpenShortcut,
  shouldOpenCommandPalette,
} from "@/modules/assistant/hooks/use-command-palette";

function keyEvent(init: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    preventDefault: () => undefined,
  } as unknown as KeyboardEvent;
}

describe("isOpenShortcut", () => {
  it("响应 Cmd+K（macOS）", () => {
    expect(isOpenShortcut(keyEvent({ key: "k", metaKey: true }))).toBe(true);
    expect(isOpenShortcut(keyEvent({ key: "K", metaKey: true }))).toBe(true);
  });

  it("响应 Ctrl+K（其他平台）", () => {
    expect(isOpenShortcut(keyEvent({ key: "k", ctrlKey: true }))).toBe(true);
    expect(isOpenShortcut(keyEvent({ key: "K", ctrlKey: true }))).toBe(true);
  });

  it("不响应裸字母 k 或其它键", () => {
    expect(isOpenShortcut(keyEvent({ key: "k" }))).toBe(false);
    expect(isOpenShortcut(keyEvent({ key: "c", metaKey: true }))).toBe(false);
    expect(isOpenShortcut(keyEvent({ key: "k", ctrlKey: true, metaKey: true }))).toBe(true);
  });

  it("shouldOpenCommandPalette 与 isOpenShortcut 一致", () => {
    expect(shouldOpenCommandPalette(keyEvent({ key: "k", ctrlKey: true }))).toBe(true);
    expect(shouldOpenCommandPalette(keyEvent({ key: "x", ctrlKey: true }))).toBe(false);
  });
});
