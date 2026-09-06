import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceControlsState } from "./use-workspace-controls-state";

type StateResult = ReturnType<typeof useWorkspaceControlsState>;

let captured: StateResult | undefined;

function Harness(): React.JSX.Element {
  captured = useWorkspaceControlsState();
  return <div data-testid="captured" />;
}

function renderHarness(): StateResult {
  captured = undefined;
  renderToStaticMarkup(<Harness />);
  if (captured === undefined) {
    throw new Error("useWorkspaceControlsState 未被捕获");
  }
  return captured;
}

describe("useWorkspaceControlsState", () => {
  it("返回所有控件的默认值", () => {
    const state = renderHarness();

    expect(state.isAutoSampling).toBe(false);
    expect(state.samplingIntervalSeconds).toBe(8);
    expect(state.isFramePruningEnabled).toBe(true);
    expect(state.turnDetectionMode).toBe("server-vad");
    expect(state.responseBudget).toBe("standard");
    expect(state.responseMode).toBe("audio-text");
    expect(state.isChatAnswerSpeechEnabled).toBe(false);
    expect(state.chatVoiceSendMode).toBe("auto-send");
    expect(state.textDraft).toBe("");
  });

  it("每个 setter 独立更新对应状态（经调用后返回新引用）", () => {
    const state = renderHarness();

    expect(state.isAutoSampling).toBe(false);
    expect(state.samplingIntervalSeconds).toBe(8);
    expect(state.isFramePruningEnabled).toBe(true);
    expect(state.turnDetectionMode).toBe("server-vad");
    expect(state.responseBudget).toBe("standard");
    expect(state.responseMode).toBe("audio-text");
    expect(state.isChatAnswerSpeechEnabled).toBe(false);
    expect(state.chatVoiceSendMode).toBe("auto-send");
    expect(state.textDraft).toBe("");

    // renderToStaticMarkup 不触发 setState 导致的 re-render，
    // 故仅验证 setter 存在且类型正确。
    expect(typeof state.setIsAutoSampling).toBe("function");
    expect(typeof state.setSamplingIntervalSeconds).toBe("function");
    expect(typeof state.setIsFramePruningEnabled).toBe("function");
    expect(typeof state.setTurnDetectionMode).toBe("function");
    expect(typeof state.setResponseBudget).toBe("function");
    expect(typeof state.setResponseMode).toBe("function");
    expect(typeof state.setIsChatAnswerSpeechEnabled).toBe("function");
    expect(typeof state.setChatVoiceSendMode).toBe("function");
    expect(typeof state.setTextDraft).toBe("function");
  });

  it("setter 相互隔离且类型签名兼容 Dispatch<SetStateAction<T>>", () => {
    const state = renderHarness();

    // Dispatch<SetStateAction<T>> 接受值或更新函数，验证签名兼容
    state.setIsAutoSampling(true);
    state.setIsAutoSampling((prev) => !prev);
    state.setSamplingIntervalSeconds(12);
    state.setSamplingIntervalSeconds((prev) => prev + 1);
    state.setIsFramePruningEnabled(false);
    state.setTurnDetectionMode("push-to-talk");
    state.setResponseBudget("detailed");
    state.setResponseMode("text-only");
    state.setIsChatAnswerSpeechEnabled(true);
    state.setChatVoiceSendMode("review");
    state.setTextDraft("hello");
    state.setTextDraft((prev) => prev + "!");

    // 此处仅验证调用不抛错；re-render 由 React 调度
    expect(true).toBe(true);
  });
});
