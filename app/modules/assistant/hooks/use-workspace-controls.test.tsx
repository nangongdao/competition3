import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceControls } from "./use-workspace-controls";
import type {
  UseWorkspaceControlsResult,
  WorkspaceControlsDeps,
} from "./use-workspace-controls";

let captured: UseWorkspaceControlsResult | undefined;

function Harness(props: { deps: WorkspaceControlsDeps }): React.JSX.Element {
  const result = useWorkspaceControls(props.deps);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): UseWorkspaceControlsResult {
  if (captured === undefined) {
    throw new Error("useWorkspaceControls 未被捕获");
  }

  return captured;
}

function makeDeps(
  overrides: Partial<WorkspaceControlsDeps> = {},
): WorkspaceControlsDeps {
  return {
    isChatVoiceRecording: false,
    setAutoSampling: vi.fn(),
    setFramePruning: vi.fn(),
    setTurnDetectionMode: vi.fn(),
    setResponseBudget: vi.fn(),
    setResponseMode: vi.fn(),
    setMicrophoneMuted: vi.fn(),
    setChatVoiceSendMode: vi.fn(),
    setChatAnswerSpeechEnabled: vi.fn(),
    setTextDraft: vi.fn(),
    setSamplingIntervalSeconds: vi.fn(),
    setTextHistorySummaryEnabled: vi.fn(),
    startChatVoiceRecording: vi.fn(() => true),
    completeChatVoiceRecording: vi.fn(() => Promise.resolve()),
    cancelChatSpeech: vi.fn(),
    addTranscript: vi.fn(() => "entry-1"),
    ...overrides,
  };
}

function renderHarness(deps: WorkspaceControlsDeps): void {
  captured = undefined;
  renderToStaticMarkup(<Harness deps={deps} />);
}

function changeEvent(
  value: string,
  checked = false,
): React.ChangeEvent<HTMLInputElement> {
  return {
    currentTarget: { value, checked },
  } as React.ChangeEvent<HTMLInputElement>;
}

afterEach(() => {
  captured = undefined;
});

describe("useWorkspaceControls", () => {
  describe("设置切换 handler（委托纯函数决策）", () => {
    it("handleAutoSamplingChange 透传 checked", () => {
      const setAutoSampling = vi.fn();
      renderHarness(makeDeps({ setAutoSampling }));

      getResult().handleAutoSamplingChange(changeEvent("", true));
      getResult().handleAutoSamplingChange(changeEvent("", false));

      expect(setAutoSampling).toHaveBeenCalledWith(true);
      expect(setAutoSampling).toHaveBeenCalledWith(false);
    });

    it("handleFramePruningChange 透传 checked", () => {
      const setFramePruning = vi.fn();
      renderHarness(makeDeps({ setFramePruning }));

      getResult().handleFramePruningChange(changeEvent("", true));

      expect(setFramePruning).toHaveBeenCalledWith(true);
    });

    it("handleTextHistorySummaryChange 透传 checked", () => {
      const setTextHistorySummaryEnabled = vi.fn();
      renderHarness(makeDeps({ setTextHistorySummaryEnabled }));

      getResult().handleTextHistorySummaryChange(changeEvent("", true));
      getResult().handleTextHistorySummaryChange(changeEvent("", false));

      expect(setTextHistorySummaryEnabled).toHaveBeenCalledWith(true);
      expect(setTextHistorySummaryEnabled).toHaveBeenCalledWith(false);
    });

    it("handleTurnDetectionModeChange 合法值透传", () => {
      const setTurnDetectionMode = vi.fn();
      renderHarness(makeDeps({ setTurnDetectionMode }));

      getResult().handleTurnDetectionModeChange(changeEvent("push-to-talk"));

      expect(setTurnDetectionMode).toHaveBeenCalledWith("push-to-talk");
    });

    it("handleTurnDetectionModeChange 非法值不更新", () => {
      const setTurnDetectionMode = vi.fn();
      renderHarness(makeDeps({ setTurnDetectionMode }));

      getResult().handleTurnDetectionModeChange(changeEvent("unknown"));

      expect(setTurnDetectionMode).not.toHaveBeenCalled();
    });

    it("handleResponseBudgetChange 合法值透传", () => {
      const setResponseBudget = vi.fn();
      renderHarness(makeDeps({ setResponseBudget }));

      getResult().handleResponseBudgetChange(changeEvent("detailed"));

      expect(setResponseBudget).toHaveBeenCalledWith("detailed");
    });

    it("handleResponseBudgetChange 非法值不更新", () => {
      const setResponseBudget = vi.fn();
      renderHarness(makeDeps({ setResponseBudget }));

      getResult().handleResponseBudgetChange(changeEvent("ultra"));

      expect(setResponseBudget).not.toHaveBeenCalled();
    });

    it("handleResponseModeChange checked → text-only", () => {
      const setResponseMode = vi.fn();
      renderHarness(makeDeps({ setResponseMode }));

      getResult().handleResponseModeChange(changeEvent("", true));

      expect(setResponseMode).toHaveBeenCalledWith("text-only");
    });

    it("handleResponseModeChange 未勾选 → audio-text", () => {
      const setResponseMode = vi.fn();
      renderHarness(makeDeps({ setResponseMode }));

      getResult().handleResponseModeChange(changeEvent("", false));

      expect(setResponseMode).toHaveBeenCalledWith("audio-text");
    });

    it("handleMicrophoneMutedChange 透传 checked", () => {
      const setMicrophoneMuted = vi.fn();
      renderHarness(makeDeps({ setMicrophoneMuted }));

      getResult().handleMicrophoneMutedChange(changeEvent("", true));

      expect(setMicrophoneMuted).toHaveBeenCalledWith(true);
    });

    it("handleChatVoiceSendModeChange 合法值透传", () => {
      const setChatVoiceSendMode = vi.fn();
      renderHarness(makeDeps({ setChatVoiceSendMode }));

      getResult().handleChatVoiceSendModeChange(changeEvent("review"));

      expect(setChatVoiceSendMode).toHaveBeenCalledWith("review");
    });

    it("handleChatVoiceSendModeChange 非法值不更新", () => {
      const setChatVoiceSendMode = vi.fn();
      renderHarness(makeDeps({ setChatVoiceSendMode }));

      getResult().handleChatVoiceSendModeChange(changeEvent("batch"));

      expect(setChatVoiceSendMode).not.toHaveBeenCalled();
    });

    it("handleTextDraftChange 透传 value", () => {
      const setTextDraft = vi.fn();
      renderHarness(makeDeps({ setTextDraft }));

      getResult().handleTextDraftChange(changeEvent("你好"));

      expect(setTextDraft).toHaveBeenCalledWith("你好");
    });

    it("handleSamplingIntervalChange 合法数字透传", () => {
      const setSamplingIntervalSeconds = vi.fn();
      renderHarness(makeDeps({ setSamplingIntervalSeconds }));

      getResult().handleSamplingIntervalChange(changeEvent("8"));

      expect(setSamplingIntervalSeconds).toHaveBeenCalledWith(8);
    });

    it("handleSamplingIntervalChange 越界不更新", () => {
      const setSamplingIntervalSeconds = vi.fn();
      renderHarness(makeDeps({ setSamplingIntervalSeconds }));

      getResult().handleSamplingIntervalChange(changeEvent("0"));
      getResult().handleSamplingIntervalChange(changeEvent("100"));

      expect(setSamplingIntervalSeconds).not.toHaveBeenCalled();
    });
  });

  describe("朗读开关（含联动停止）", () => {
    it("开启时仅设置 enabled=true", () => {
      const setChatAnswerSpeechEnabled = vi.fn();
      const cancelChatSpeech = vi.fn();
      renderHarness(makeDeps({ setChatAnswerSpeechEnabled, cancelChatSpeech }));

      getResult().handleChatAnswerSpeechChange(changeEvent("", true));

      expect(setChatAnswerSpeechEnabled).toHaveBeenCalledWith(true);
      expect(cancelChatSpeech).not.toHaveBeenCalled();
    });

    it("关闭时设置 enabled=false 并联动停止朗读", () => {
      const setChatAnswerSpeechEnabled = vi.fn();
      const cancelChatSpeech = vi.fn();
      renderHarness(makeDeps({ setChatAnswerSpeechEnabled, cancelChatSpeech }));

      getResult().handleChatAnswerSpeechChange(changeEvent("", false));

      expect(setChatAnswerSpeechEnabled).toHaveBeenCalledWith(false);
      expect(cancelChatSpeech).toHaveBeenCalledTimes(1);
    });
  });

  describe("动作 handler", () => {
    it("handleChatSpeechInputClick 未录音时开始录音", () => {
      const startChatVoiceRecording = vi.fn(() => true);
      const completeChatVoiceRecording = vi.fn(() => Promise.resolve());
      renderHarness(
        makeDeps({
          isChatVoiceRecording: false,
          startChatVoiceRecording,
          completeChatVoiceRecording,
        }),
      );

      getResult().handleChatSpeechInputClick();

      expect(startChatVoiceRecording).toHaveBeenCalledTimes(1);
      expect(completeChatVoiceRecording).not.toHaveBeenCalled();
    });

    it("handleChatSpeechInputClick 录音中时完成录音", () => {
      const startChatVoiceRecording = vi.fn(() => true);
      const completeChatVoiceRecording = vi.fn(() => Promise.resolve());
      renderHarness(
        makeDeps({
          isChatVoiceRecording: true,
          startChatVoiceRecording,
          completeChatVoiceRecording,
        }),
      );

      getResult().handleChatSpeechInputClick();

      expect(completeChatVoiceRecording).toHaveBeenCalledWith("manual");
      expect(startChatVoiceRecording).not.toHaveBeenCalled();
    });

    it("handleCancelChatSpeech 停止朗读并提示", () => {
      const cancelChatSpeech = vi.fn();
      const addTranscript = vi.fn(() => "entry-1");
      renderHarness(makeDeps({ cancelChatSpeech, addTranscript }));

      getResult().handleCancelChatSpeech();

      expect(cancelChatSpeech).toHaveBeenCalledTimes(1);
      expect(addTranscript).toHaveBeenCalledWith("system", "已停止朗读。");
    });
  });
});
