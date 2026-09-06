import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UsageReport } from "@/modules/assistant/lib/cost-model";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下的 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { UsagePanel } from "./usage-panel";

const emptyUsage: UsageReport = {
  turnCount: 0,
  totals: {
    inputTokens: 0,
    inputTextTokens: 0,
    inputAudioTokens: 0,
    inputImageTokens: 0,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
  },
  lastTurn: null,
  estimatedCostUsd: 0,
  turns: [],
};

const baseProps = {
  usageReport: emptyUsage,
  usageExport: {
    jsonDownloadUrl: "blob:usage-json",
    csvDownloadUrl: "blob:usage-csv",
    jsonFilename: "usage.json",
    csvFilename: "usage.csv",
  },
  isVisible: true,
  skippedAutoFrameCount: 0,
  sampleWidth: 640,
  sampleHeight: 360,
};

describe("UsagePanel", () => {
  it("可见时渲染面板与导出按钮", () => {
    const html = renderToStaticMarkup(<UsagePanel {...baseProps} />);
    expect(html).toContain('aria-label="usage.panel"');
    expect(html).toContain("usage.export");
    expect(html).toContain('download="usage.json"');
    expect(html).toContain('download="usage.csv"');
  });

  it("不可见时面板隐藏", () => {
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} isVisible={false} />,
    );
    expect(html).toContain('hidden=""');
  });

  it("显示轮次、成本与最近输入 token", () => {
    const usageReport: UsageReport = {
      ...emptyUsage,
      turnCount: 5,
      estimatedCostUsd: 0.0123,
      lastTurn: {
        inputTokens: 100,
        inputTextTokens: 40,
        inputAudioTokens: 30,
        inputImageTokens: 30,
        cachedInputTokens: 0,
        cachedTextTokens: 0,
        cachedAudioTokens: 0,
        cachedImageTokens: 0,
        outputTokens: 50,
        outputTextTokens: 50,
        outputAudioTokens: 0,
      },
    };
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} usageReport={usageReport} />,
    );
    expect(html).toContain("usage.turns");
    expect(html).toContain("usage.estimatedCost");
    expect(html).toContain("$0.012");
  });

  it("无跳过帧时不渲染节省金额区块", () => {
    const html = renderToStaticMarkup(<UsagePanel {...baseProps} />);
    expect(html).not.toContain("usage.savedBySkipping");
  });

  it("默认（Realtime）模式渲染权威账单来源标注与 provider 核对提示", () => {
    const html = renderToStaticMarkup(<UsagePanel {...baseProps} />);
    // 账单来源区 aria-label
    expect(html).toContain('aria-label="usage.billSource"');
    // Realtime 权威计量 + 单价集
    expect(html).toContain("usage.billSourceRealtime");
    expect(html).toContain("usage.billUsageAuthoritative");
    // provider 账单核对提示
    expect(html).toContain("usage.billVerifyProvider");
  });

  it("Chat 模式渲染估算账单来源标注与 provider 核对提示", () => {
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} isChatMode />,
    );
    expect(html).toContain('aria-label="usage.billSource"');
    expect(html).toContain("usage.billSourceChat");
    expect(html).toContain("usage.billUsageEstimated");
    expect(html).toContain("usage.billVerifyProvider");
  });

  it("有跳过帧时渲染节省金额", () => {
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} skippedAutoFrameCount={10} />,
    );
    expect(html).toContain("usage.savedBySkipping");
  });

  it("有跳过帧时渲染降分辨率收益对比", () => {
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} skippedAutoFrameCount={10} />,
    );
    expect(html).toContain("usage.resolutionOptimization");
    expect(html).toContain("usage.savePercent");
  });

  it("未提供 sessionUsageExport 时不渲染会话级用量导出区", () => {
    const html = renderToStaticMarkup(<UsagePanel {...baseProps} />);
    expect(html).not.toContain("usage.sessionExport");
  });

  it("提供 sessionUsageExport 时渲染会话级用量导出区（JSON/CSV）", () => {
    const sessionUsageExport = {
      jsonDownloadUrl: "data:application/json;base64,AAAA",
      csvDownloadUrl: "data:text/csv;base64,BBBB",
      jsonFilename: "session-usage-s1-1.json",
      csvFilename: "session-usage-s1-1.csv",
    };
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} sessionUsageExport={sessionUsageExport} />,
    );
    expect(html).toContain('aria-label="usage.sessionExport"');
    expect(html).toContain('download="session-usage-s1-1.json"');
    expect(html).toContain('download="session-usage-s1-1.csv"');
  });

  it("未提供 sessionUsageTrend 时不渲染趋势图表", () => {
    const html = renderToStaticMarkup(<UsagePanel {...baseProps} />);
    expect(html).not.toContain('aria-label="usage.trend"');
  });

  it("提供非空 sessionUsageTrend 时渲染趋势图表", () => {
    const trend = {
      points: [
        {
          index: 1,
          recordedAt: 1000,
          estimatedCostUsd: 0.01,
          cumulativeCostUsd: 0.01,
          inputTokens: 100,
          outputTokens: 40,
        },
      ],
      peakCostUsd: 0.01,
      totalCostUsd: 0.01,
      totalInputTokens: 100,
      totalOutputTokens: 40,
      peakTokens: 100,
    };
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} sessionUsageTrend={trend} />,
    );
    expect(html).toContain('aria-label="usage.trend"');
    expect(html).toContain("usage.trendTitle");
  });

  it("Realtime 模式渲染服务商价格表（gpt-realtime 单价）", () => {
    const html = renderToStaticMarkup(<UsagePanel {...baseProps} />);
    expect(html).toContain('aria-label="usage.priceTable"');
    expect(html).toContain("usage.priceRealtime");
    expect(html).toContain("usage.priceInputText");
    expect(html).toContain("usage.priceOutputAudio");
    // 8 行 Realtime 模态单价 + 缓存费率注释。
    expect(html).toContain("usage.priceCachedRate");
    expect(html).toContain("usage.priceNote");
  });

  it("Chat 模式渲染视觉 Chat 价格表（3 行单价）", () => {
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} isChatMode={true} />,
    );
    expect(html).toContain("usage.priceChat");
    expect(html).toContain("usage.priceInputText");
    expect(html).toContain("usage.priceInputImage");
    expect(html).toContain("usage.priceOutputText");
    // Chat 无音频/缓存模态。
    expect(html).not.toContain("usage.priceOutputAudio");
  });

  it("未设置预算时渲染预算入口但无进度条", () => {
    const html = renderToStaticMarkup(<UsagePanel {...baseProps} />);
    expect(html).toContain("data-budget-guard");
    expect(html).toContain("usage.budget");
    expect(html).toContain("usage.budgetUnset");
    // 无预算 → 不渲染进度条（role=progressbar 仅在有预算时出现）。
    expect(html).not.toContain('role="progressbar"');
  });

  it("有预算时渲染进度条且不渲染告警文案（未达阈值）", () => {
    const usageReport: UsageReport = {
      ...emptyUsage,
      turnCount: 1,
      estimatedCostUsd: 0.2,
    };
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} usageReport={usageReport} budgetUsd={2} />,
    );
    expect(html).toContain("data-budget-guard");
    expect(html).toContain("usage.budgetProgress");
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain("usage.budgetWarning");
    expect(html).not.toContain("usage.budgetExceeded");
  });

  it("达 80% 预算时渲染 warning 告警", () => {
    const usageReport: UsageReport = {
      ...emptyUsage,
      turnCount: 1,
      estimatedCostUsd: 1.6,
    };
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} usageReport={usageReport} budgetUsd={2} />,
    );
    expect(html).toContain("usage.budgetWarning");
    expect(html).not.toContain("usage.budgetExceeded");
  });

  it("达/超 100% 预算时渲染 exceeded 告警", () => {
    const usageReport: UsageReport = {
      ...emptyUsage,
      turnCount: 1,
      estimatedCostUsd: 2.5,
    };
    const html = renderToStaticMarkup(
      <UsagePanel {...baseProps} usageReport={usageReport} budgetUsd={2} />,
    );
    expect(html).toContain("usage.budgetExceeded");
  });

  it("有预算时渲染清除按钮（onBudgetSet 提供时）", () => {
    const html = renderToStaticMarkup(
      <UsagePanel
        {...baseProps}
        budgetUsd={5}
        onBudgetSet={() => undefined}
      />,
    );
    expect(html).toContain("usage.budgetClear");
    expect(html).toContain('type="number"');
  });
});
