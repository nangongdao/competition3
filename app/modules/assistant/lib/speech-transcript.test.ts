import { describe, expect, it } from "vitest";

import { resolveDraftFill } from "./speech-transcript";

describe("resolveDraftFill — 语音识别文本合并进草稿", () => {
  it("空草稿直接采用识别文本", () => {
    const result = resolveDraftFill("", "你好");
    expect(result.draft).toBe("你好");
    expect(result.changed).toBe(true);
  });

  it("全空白草稿视为空，直接采用识别文本", () => {
    const result = resolveDraftFill("   ", "你好");
    expect(result.draft).toBe("你好");
    expect(result.changed).toBe(true);
  });

  it("非空草稿以单个空格拼接识别文本", () => {
    const result = resolveDraftFill("今天天气", "怎么样？");
    expect(result.draft).toBe("今天天气 怎么样？");
    expect(result.changed).toBe(true);
  });

  it("非空草稿去除首尾空白后再拼接", () => {
    const result = resolveDraftFill("  今天天气  ", "不错");
    expect(result.draft).toBe("今天天气 不错");
    expect(result.changed).toBe(true);
  });

  it("空草稿 + 空识别文本：无变化", () => {
    const result = resolveDraftFill("", "");
    expect(result.draft).toBe("");
    expect(result.changed).toBe(false);
  });

  it("全空白草稿 + 空识别文本：仍为空且无变化", () => {
    const result = resolveDraftFill("  ", "");
    expect(result.draft).toBe("");
    expect(result.changed).toBe(false);
  });
});
