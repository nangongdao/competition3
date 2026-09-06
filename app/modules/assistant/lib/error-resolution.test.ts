import { describe, expect, it } from "vitest";

import { resolveVisibleError } from "@/modules/assistant/lib/error-resolution";

describe("resolveVisibleError", () => {
  it("全部源为空 / undefined 时返回 undefined", () => {
    expect(resolveVisibleError()).toBeUndefined();
    expect(resolveVisibleError(undefined, undefined)).toBeUndefined();
    expect(resolveVisibleError("", "", "")).toBeUndefined();
    expect(resolveVisibleError(undefined, "", undefined, "")).toBeUndefined();
  });

  it("命中首个非空错误并保留其优先级顺序", () => {
    expect(
      resolveVisibleError("媒体错误", "供应商错误", "Realtime 错误"),
    ).toBe("媒体错误");
  });

  it("首个源为空时命中中间的源", () => {
    expect(
      resolveVisibleError(undefined, "供应商错误", "Realtime 错误"),
    ).toBe("供应商错误");
  });

  it("命中末尾的源（前面全部为空）", () => {
    expect(
      resolveVisibleError(undefined, "", undefined, "Chat 错误"),
    ).toBe("Chat 错误");
  });

  it("空字符串被跳过，不影响后续命中", () => {
    expect(
      resolveVisibleError("", "供应商错误", ""),
    ).toBe("供应商错误");
  });

  it("返回第一个非空值，不比较后续源", () => {
    // 语义：第一个非空即返回，不比较"哪个更重要"，由调用方控制传入顺序。
    expect(
      resolveVisibleError("媒体错误", "", "Realtime 错误"),
    ).toBe("媒体错误");
  });
});
