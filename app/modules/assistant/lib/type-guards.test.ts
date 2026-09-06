import { describe, expect, it } from "vitest";

import { getStringField, isRecord } from "./type-guards";

describe("isRecord", () => {
  it("普通对象返回 true", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1, b: "x" })).toBe(true);
  });

  it("null / undefined / 原始类型返回 false", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("str")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it("数组也视为 record（浅层窄化，typeof object 语义）", () => {
    // 该窄化仅区分 object/null 与其余类型；数组属于 object，同样判为 record。
    expect(isRecord([1, 2])).toBe(true);
  });
});

describe("getStringField", () => {
  it("字符串字段返回其值", () => {
    const record = { type: "hello", name: "world" };
    expect(getStringField(record, "type")).toBe("hello");
    expect(getStringField(record, "name")).toBe("world");
  });

  it("字段不存在返回 null", () => {
    expect(getStringField({ a: 1 }, "missing")).toBe(null);
  });

  it("字段非字符串（数字 / 布尔 / 对象）返回 null", () => {
    expect(getStringField({ n: 42 }, "n")).toBe(null);
    expect(getStringField({ b: true }, "b")).toBe(null);
    expect(getStringField({ o: {} }, "o")).toBe(null);
    expect(getStringField({ arr: [] }, "arr")).toBe(null);
    expect(getStringField({ nil: null }, "nil")).toBe(null);
  });

  it("空对象任意字段返回 null", () => {
    expect(getStringField({}, "anything")).toBe(null);
  });
});
