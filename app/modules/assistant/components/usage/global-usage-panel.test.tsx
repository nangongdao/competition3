import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：t 返回 key，但对含插值参数的情况拼出可见文本（供断言模态拆分）。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts === undefined || Object.keys(opts).length === 0) {
        return key;
      }
      return `${key}:${Object.values(opts).join("/")}`;
    },
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { GlobalUsagePanel } from "./global-usage-panel";
import type { UsageTotals } from "@/modules/assistant/lib/session-client";

const TOTALS: UsageTotals = {
  turnCount: 12,
  inputTokens: 45_000,
  inputTextTokens: 9_000,
  inputAudioTokens: 30_000,
  inputImageTokens: 6_000,
  cachedInputTokens: 2_000,
  cachedTextTokens: 500,
  cachedAudioTokens: 1_000,
  cachedImageTokens: 500,
  outputTokens: 3_000,
  outputTextTokens: 1_000,
  outputAudioTokens: 2_000,
  estimatedCostUsd: 0.1234,
};

describe("GlobalUsagePanel", () => {
  it("totals 为 null 时渲染不可用提示", () => {
    const html = renderToStaticMarkup(<GlobalUsagePanel totals={null} />);
    expect(html).toContain('aria-label="usage.globalPanel"');
    expect(html).toContain("usage.globalUnavailable");
  });

  it("渲染轮次、成本与总输入统计", () => {
    const html = renderToStaticMarkup(<GlobalUsagePanel totals={TOTALS} />);
    expect(html).toContain("usage.globalTitle");
    expect(html).toContain("usage.turns");
    expect(html).toContain("usage.estimatedCost");
    expect(html).toContain("usage.globalInput");
    expect(html).toContain("$0.1234");
  });

  it("渲染模态拆分说明（音频/图像/文本/输出）", () => {
    const html = renderToStaticMarkup(<GlobalUsagePanel totals={TOTALS} />);
    expect(html).toContain("usage.globalSplit:30.0k/6.0k/9.0k/3.0k");
  });

  it("未提供 exportBundle 时不渲染导出按钮", () => {
    const html = renderToStaticMarkup(<GlobalUsagePanel totals={TOTALS} />);
    expect(html).not.toContain("JSON");
    expect(html).not.toContain("CSV");
  });

  it("提供 exportBundle 时渲染 JSON/CSV 下载链接", () => {
    const exportBundle = {
      jsonDownloadUrl: "data:application/json;base64,AAAA",
      csvDownloadUrl: "data:text/csv;base64,BBBB",
      jsonFilename: "global-usage-1.json",
      csvFilename: "global-usage-1.csv",
    };
    const html = renderToStaticMarkup(
      <GlobalUsagePanel totals={TOTALS} exportBundle={exportBundle} />,
    );
    expect(html).toContain('download="global-usage-1.json"');
    expect(html).toContain('download="global-usage-1.csv"');
  });

  it("渲染跨会话成本换算单价：Realtime 与 Chat 两张价格表", () => {
    const html = renderToStaticMarkup(<GlobalUsagePanel totals={TOTALS} />);
    expect(html).toContain('aria-label="usage.priceTable"');
    expect(html).toContain("usage.pricePerMillion");
    expect(html).toContain("usage.priceRealtime");
    expect(html).toContain("usage.priceChat");
    expect(html).toContain("usage.priceInputText");
    expect(html).toContain("usage.priceOutputAudio");
    expect(html).toContain("usage.priceNote");
  });
});
