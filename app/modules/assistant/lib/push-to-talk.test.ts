import { describe, expect, it } from "vitest";

import {
  isPushToTalkActivationKey,
  isPushToTalkReleaseKey,
} from "@/modules/assistant/lib/push-to-talk";

describe("isPushToTalkActivationKey", () => {
  it("返回 true 当按空格且允许 PTT", () => {
    expect(isPushToTalkActivationKey(" ", true, false)).toBe(true);
  });

  it("返回 true 当按回车且允许 PTT", () => {
    expect(isPushToTalkActivationKey("Enter", true, false)).toBe(true);
  });

  it("返回 false 当 keydown 处于 auto-repeat（长按重复）", () => {
    expect(isPushToTalkActivationKey(" ", true, true)).toBe(false);
  });

  it("返回 false 当 PTT 被禁用", () => {
    expect(isPushToTalkActivationKey(" ", false, false)).toBe(false);
  });

  it("返回 false 当按下非激活键（如 a）", () => {
    expect(isPushToTalkActivationKey("a", true, false)).toBe(false);
  });

  it("返回 false 当按下 Shift 等修饰键", () => {
    expect(isPushToTalkActivationKey("Shift", true, false)).toBe(false);
  });
});

describe("isPushToTalkReleaseKey", () => {
  it("返回 true 当松开空格", () => {
    expect(isPushToTalkReleaseKey(" ")).toBe(true);
  });

  it("返回 true 当松开回车", () => {
    expect(isPushToTalkReleaseKey("Enter")).toBe(true);
  });

  it("返回 false 当松开其他键", () => {
    expect(isPushToTalkReleaseKey("Escape")).toBe(false);
  });

  it("释放判定不依赖 canPushToTalk（禁用态也应能释放）", () => {
    // 释放仅看按键本身
    expect(isPushToTalkReleaseKey(" ")).toBe(true);
  });
});
