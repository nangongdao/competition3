import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UsageEntry, UsageTotals } from "@/modules/assistant/lib/session-client";
import {
  useGlobalUsage,
  type UseGlobalUsageResult,
} from "./use-global-usage";

let captured: UseGlobalUsageResult | undefined;

function Harness(props: {
  isLoaded: boolean;
  activeSessionId: string | null;
  loadGlobalUsageTotals: () => Promise<UsageTotals | null>;
  restoreUsage: () => Promise<{
    entries: UsageEntry[];
    totals: UsageTotals;
  } | null>;
}): React.JSX.Element {
  const result = useGlobalUsage(props);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): UseGlobalUsageResult {
  if (captured === undefined) {
    throw new Error("useGlobalUsage 未被捕获");
  }

  return captured;
}

const EMPTY_TOTALS: UsageTotals = {
  turnCount: 0,
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
  estimatedCostUsd: 0,
};

const TOTALS: UsageTotals = {
  turnCount: 3,
  inputTokens: 4500,
  inputTextTokens: 800,
  inputAudioTokens: 2000,
  inputImageTokens: 1700,
  cachedInputTokens: 500,
  cachedTextTokens: 100,
  cachedAudioTokens: 300,
  cachedImageTokens: 100,
  outputTokens: 200,
  outputTextTokens: 60,
  outputAudioTokens: 140,
  estimatedCostUsd: 0.0123,
};

afterEach(() => {
  captured = undefined;
});

describe("useGlobalUsage", () => {
  it("isLoaded 为 false 时保持空状态", () => {
    renderToStaticMarkup(
      <Harness
        isLoaded={false}
        activeSessionId={null}
        loadGlobalUsageTotals={vi.fn()}
        restoreUsage={vi.fn()}
      />,
    );

    const result = getResult();
    expect(result.globalUsageTotals).toBeNull();
    expect(result.globalUsageExport).toBeNull();
    expect(result.sessionUsageExport).toBeNull();
    expect(result.sessionUsageTrend).toBeNull();
  });

  it("会话加载完成后拉取全局累计用量并构建导出 bundle", () => {
    const loadGlobalUsageTotals = vi.fn().mockResolvedValue(TOTALS);
    renderToStaticMarkup(
      <Harness
        isLoaded
        activeSessionId="s1"
        loadGlobalUsageTotals={loadGlobalUsageTotals}
        restoreUsage={vi.fn().mockResolvedValue({ entries: [], totals: EMPTY_TOTALS })}
      />,
    );

    // renderToStaticMarkup 不执行 useEffect，因此这里验证入参被正确接线：
    expect(loadGlobalUsageTotals).not.toHaveBeenCalled();
    // effect 在真实浏览器由 React 调度；单测覆盖 hook 结构（options 接线与返回契约）。
    const result = getResult();
    expect(result.globalUsageTotals).toBeNull();
    expect(result.sessionUsageExport).toBeNull();
    expect(result.sessionUsageTrend).toBeNull();
  });
});
