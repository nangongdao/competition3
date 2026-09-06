import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, afterEach } from "vitest";

import {
  useAssistantStats,
  type AssistantStatsResult,
} from "./use-assistant-stats";

let captured: AssistantStatsResult | undefined;

function Harness(): React.JSX.Element {
  captured = useAssistantStats();
  return <div data-testid="captured" />;
}

function renderHarness(): void {
  captured = undefined;
  renderToStaticMarkup(<Harness />);
}

function getResult(): AssistantStatsResult {
  if (captured === undefined) {
    throw new Error("useAssistantStats 未被捕获");
  }
  return captured;
}

afterEach(() => {
  captured = undefined;
});

describe("useAssistantStats", () => {
  it("返回场景记忆统计的初始默认值（count/savingsTokens 均为 0）", () => {
    renderHarness();
    expect(getResult().sceneMemoryStats).toEqual({ count: 0, savingsTokens: 0 });
  });

  it("返回多模态融合统计的初始默认值（count/savedCalls/imageTokens 均为 0）", () => {
    renderHarness();
    expect(getResult().fusionStats).toEqual({
      count: 0,
      savedCalls: 0,
      imageTokens: 0,
    });
  });

  it("暴露场景记忆统计的 setter（React 状态更新函数）", () => {
    renderHarness();
    expect(typeof getResult().setSceneMemoryStats).toBe("function");
  });

  it("暴露多模态融合统计的 setter（React 状态更新函数）", () => {
    renderHarness();
    expect(typeof getResult().setFusionStats).toBe("function");
  });
});
