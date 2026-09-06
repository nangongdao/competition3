import { describe, expect, it } from "vitest";
import { buildRetryableEntryIds } from "./retryable-entry-ids";

describe("buildRetryableEntryIds", () => {
  it("空表 → 空集合", () => {
    expect(buildRetryableEntryIds({}).size).toBe(0);
  });

  it("undefined → 空集合（调用方可直接传组件 state）", () => {
    expect(buildRetryableEntryIds(undefined).size).toBe(0);
  });

  it("非空表 → 返回全部 key 的集合", () => {
    const set = buildRetryableEntryIds({
      "entry-1": { message: "a" },
      "entry-2": { message: "b" },
    });
    expect(set.has("entry-1")).toBe(true);
    expect(set.has("entry-2")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("返回集合与入参无共享引用（调用方可安全消费）", () => {
    const turns = { "entry-1": { message: "a" } };
    const set = buildRetryableEntryIds(turns);
    expect(set).not.toBe(turns);
  });

  it("纯函数性：不修改入参", () => {
    const turns = { "entry-1": { message: "a" } };
    const snapshot = JSON.stringify(turns);
    buildRetryableEntryIds(turns);
    expect(JSON.stringify(turns)).toBe(snapshot);
  });
});
