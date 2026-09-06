import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaAccess } from "./use-media-access";
import type { MediaAccessDeps } from "./use-media-access";

/** 暴露 hook 返回值的模块级捕获器（供测试调用 handler）。 */
let captured: ReturnType<typeof useMediaAccess> | undefined;

function Harness(props: { deps: MediaAccessDeps }): React.JSX.Element {
  const result = useMediaAccess(props.deps);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): ReturnType<typeof useMediaAccess> {
  if (captured === undefined) {
    throw new Error("useMediaAccess 未被捕获");
  }

  return captured;
}

function makeDeps(overrides: Partial<MediaAccessDeps> = {}): MediaAccessDeps {
  return {
    requestAccess: vi.fn(() => Promise.resolve()),
    stopAccess: vi.fn(),
    stopContinuousChatVoice: vi.fn(),
    cancelChatVoiceRecording: vi.fn(),
    stopSession: vi.fn(),
    setAutoSampling: vi.fn(),
    dispatch: vi.fn(),
    lastUploadedFrameSignatureRef: { current: {} as never },
    setMicrophoneMuted: vi.fn(),
    addTranscript: vi.fn(() => "entry-1"),
    ...overrides,
  };
}

function renderHarness(deps: MediaAccessDeps): void {
  captured = undefined;
  renderToStaticMarkup(<Harness deps={deps} />);
}

afterEach(() => {
  captured = undefined;
});

describe("useMediaAccess", () => {
  it("handleRequestAccess 委托 requestAccess", () => {
    const requestAccess = vi.fn(() => Promise.resolve());
    renderHarness(makeDeps({ requestAccess }));

    getResult().handleRequestAccess();

    expect(requestAccess).toHaveBeenCalledTimes(1);
  });

  it("handleReleaseMedia 依次执行释放动作序列", () => {
    const stopContinuousChatVoice = vi.fn();
    const cancelChatVoiceRecording = vi.fn();
    const stopSession = vi.fn();
    const stopAccess = vi.fn();
    const setAutoSampling = vi.fn();
    const dispatch = vi.fn();
    const setMicrophoneMuted = vi.fn();
    const addTranscript = vi.fn(() => "entry-1");
    const lastUploadedFrameSignatureRef = { current: {} as never };

    renderHarness(
      makeDeps({
        stopContinuousChatVoice,
        cancelChatVoiceRecording,
        stopSession,
        stopAccess,
        setAutoSampling,
        dispatch,
        setMicrophoneMuted,
        addTranscript,
        lastUploadedFrameSignatureRef,
      }),
    );

    getResult().handleReleaseMedia();

    // 停连续语音 / 取消语音录制 / 停会话 / 停访问
    expect(stopContinuousChatVoice).toHaveBeenCalledTimes(1);
    expect(cancelChatVoiceRecording).toHaveBeenCalledTimes(1);
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(stopAccess).toHaveBeenCalledTimes(1);
    // 关自动采样、取消静音
    expect(setAutoSampling).toHaveBeenCalledWith(false);
    expect(setMicrophoneMuted).toHaveBeenCalledWith(false);
    // 帧状态重置
    expect(dispatch).toHaveBeenCalledWith({ type: "last-frame-cleared" });
    expect(dispatch).toHaveBeenCalledWith({ type: "frame-upload-counters-reset" });
    expect(lastUploadedFrameSignatureRef.current).toBeNull();
    // 提示文案
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      "已关闭摄像头和麦克风。",
    );
  });

  it("handleReleaseMedia 不调用 requestAccess", () => {
    const requestAccess = vi.fn(() => Promise.resolve());
    renderHarness(makeDeps({ requestAccess }));

    getResult().handleReleaseMedia();

    expect(requestAccess).not.toHaveBeenCalled();
  });
});
