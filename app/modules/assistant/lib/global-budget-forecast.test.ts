import { describe, expect, it } from "vitest";

import {
  buildMonthSpendSeries,
  projectMonthEndSpend,
  projectStatus,
  remainingMonthDays,
  type MonthUsageDay,
} from "./global-budget-forecast";

function day(key: string, spentUsd: number): MonthUsageDay {
  return { dayKey: key, spentUsd };
}

describe("buildMonthSpendSeries", () => {
  it("空序列返回空", () => {
    const series = buildMonthSpendSeries([]);
    expect(series.points).toHaveLength(0);
    expect(series.totalUsd).toBe(0);
    expect(series.dayCount).toBe(0);
  });

  it("按天升序折叠累计成本", () => {
    const series = buildMonthSpendSeries([
      day("2026-08-05", 1),
      day("2026-08-01", 2),
      day("2026-08-03", 3),
    ]);
    expect(series.points.map((p) => [p.dayOffset, p.cumulativeUsd])).toEqual([
      [0, 2],
      [2, 5],
      [4, 6],
    ]);
    expect(series.totalUsd).toBe(6);
    expect(series.dayCount).toBe(3);
  });

  it("过滤非法天数与非法金额", () => {
    const series = buildMonthSpendSeries([
      day("2026-08-01", 2),
      day("2026-08-00", 5),
      day("invalid", 5),
      day("2026-08-02", -1),
      day("2026-08-02", 0),
    ]);
    expect(series.points).toHaveLength(1);
    expect(series.totalUsd).toBe(2);
  });
});

describe("projectStatus", () => {
  it("低于阈值 → on-track", () => {
    expect(projectStatus(50)).toBe("on-track");
  });

  it("达到阈值未达 100 → at-risk", () => {
    expect(projectStatus(80)).toBe("at-risk");
    expect(projectStatus(99)).toBe("at-risk");
  });

  it("达到/超过 100 → over-budget", () => {
    expect(projectStatus(100)).toBe("over-budget");
    expect(projectStatus(120)).toBe("over-budget");
  });

  it("非法阈值回退默认 80", () => {
    expect(projectStatus(85, 0)).toBe("at-risk");
  });
});

describe("remainingMonthDays", () => {
  it("月初返回约整月天数", () => {
    // 2026-08-01 → 剩余 31 天。
    const days = remainingMonthDays(Date.UTC(2026, 7, 1, 0, 0, 0, 0));
    expect(days).toBe(31);
  });

  it("月末返回 1", () => {
    // 2026-08-31 23:59 → 剩余 1 天。
    const days = remainingMonthDays(Date.UTC(2026, 7, 31, 23, 59, 0, 0));
    expect(days).toBe(1);
  });
});

describe("projectMonthEndSpend", () => {
  it("样本不足返回 invalid", () => {
    const series = buildMonthSpendSeries([day("2026-08-01", 2)]);
    const forecast = projectMonthEndSpend(
      series,
      100,
      Date.UTC(2026, 7, 10),
    );
    expect(forecast.valid).toBe(false);
    expect(forecast.fitPointCount).toBe(1);
  });

  it("稳定消费趋势外推到月末并判定 on-track", () => {
    // 8 月每天消费 1 USD，到 8 月 5 日累计 5；距月末 27 天。
    const series = buildMonthSpendSeries([
      day("2026-08-01", 1),
      day("2026-08-02", 1),
      day("2026-08-03", 1),
      day("2026-08-04", 1),
      day("2026-08-05", 1),
    ]);
    const forecast = projectMonthEndSpend(
      series,
      100,
      Date.UTC(2026, 7, 5),
      { alertThresholdPct: 80 },
    );
    expect(forecast.valid).toBe(true);
    expect(forecast.remainingDays).toBe(27);
    // 斜率 ≈ 1 USD/天，锚点 ≈ 5 → 预计月底 ≈ 5 + 27 = 32。
    expect(forecast.projectedMonthEndUsd).toBeCloseTo(32, 0);
    expect(forecast.projectedDeltaUsd).toBeCloseTo(27, 0);
    expect(forecast.projectedUtilizationPct).toBeCloseTo(32, 0);
    expect(forecast.status).toBe("on-track");
  });

  it("高消费趋势导致 over-budget", () => {
    // 每天 10 USD，到 8 月 5 日累计 50；预算 80 → 预计月底 50 + 10*27 = 320 > 80。
    const series = buildMonthSpendSeries(
      [1, 2, 3, 4, 5].map((d) =>
        day(`2026-08-0${d}`, 10),
      ),
    );
    const forecast = projectMonthEndSpend(
      series,
      80,
      Date.UTC(2026, 7, 5),
      { alertThresholdPct: 80 },
    );
    expect(forecast.valid).toBe(true);
    expect(forecast.projectedMonthEndUsd).toBeGreaterThan(80);
    expect(forecast.projectedUtilizationPct).toBeGreaterThan(100);
    expect(forecast.status).toBe("over-budget");
  });

  it("中等趋势判定 at-risk", () => {
    // 每天 3 USD，到 8 月 5 日累计 15；预算 60 → 预计月底 15 + 3*27 = 96 → 160% over。
    // 用预算 100：15 + 3*27 = 96 → 96% → at-risk。
    const series = buildMonthSpendSeries(
      [1, 2, 3, 4, 5].map((d) => day(`2026-08-0${d}`, 3)),
    );
    const forecast = projectMonthEndSpend(
      series,
      100,
      Date.UTC(2026, 7, 5),
      { alertThresholdPct: 80 },
    );
    expect(forecast.valid).toBe(true);
    expect(forecast.projectedUtilizationPct).toBeCloseTo(96, 0);
    expect(forecast.status).toBe("at-risk");
  });
});
