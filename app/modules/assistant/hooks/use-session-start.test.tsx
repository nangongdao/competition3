import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSessionStart } from "./use-session-start";
import type { SessionStartDeps } from "./use-session-start";

/** 暴露 hook 返回值的模块级捕获器（供测试调用 handler）。 */
let captured: ReturnType<typeof useSessionStart> | undefined;

function Harness(props: { deps: SessionStartDeps }): React.JSX.Element {
  const result = useSessionStart(props.deps);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): ReturnType<typeof useSessionStart> {
  if (captured === undefined) {
    throw new Error("useSessionStart 未被捕获");
  }

  return captured;
}

function makeDeps(overrides: Partial<SessionStartDeps> = {}): SessionStartDeps {
  return {
    isChatMode: false,
    mediaGranted: true,
    dispatch: vi.fn(),
    addTranscript: vi.fn(() => "entry-1"),
    lastUploadedFrameSignatureRef: { current: null },
    isAutoSampling: true,
    turnDetectionMode: "server-vad",
    responseBudget: "standard",
    startRealtimeSession: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
}

function renderHarness(deps: SessionStartDeps): void {
  captured = undefined;
  renderToStaticMarkup(<Harness deps={deps} />);
}

afterEach(() => {
  captured = undefined;
});

describe("useSessionStart", () => {
  it("Chat 模式下提示无需启动 Realtime，不创建会话", () => {
    const addTranscript = vi.fn();
    const startRealtimeSession = vi.fn(() => Promise.resolve(true));
    renderHarness(
      makeDeps({ isChatMode: true, addTranscript, startRealtimeSession }),
    );

    getResult().handleStartSession();

    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("无需启动 Realtime"),
    );
    expect(startRealtimeSession).not.toHaveBeenCalled();
  });

  it("Realtime 模式但媒体未授权时进入 error 态并提示", () => {
    const dispatch = vi.fn();
    const addTranscript = vi.fn();
    const startRealtimeSession = vi.fn(() => Promise.resolve(true));
    renderHarness(
      makeDeps({ mediaGranted: false, dispatch, addTranscript, startRealtimeSession }),
    );

    getResult().handleStartSession();

    expect(dispatch).toHaveBeenCalledWith({ type: "phase-set", phase: "error" });
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("请先授权摄像头和麦克风"),
    );
    expect(startRealtimeSession).not.toHaveBeenCalled();
  });

  it("Realtime 模式且媒体已授权时创建会话", () => {
    const dispatch = vi.fn();
    const addTranscript = vi.fn(() => "entry-1");
    const startRealtimeSession = vi.fn(() => Promise.resolve(true));
    const lastUploadedFrameSignatureRef = { current: {} as never };
    renderHarness(
      makeDeps({
        dispatch,
        addTranscript,
        startRealtimeSession,
        lastUploadedFrameSignatureRef,
      }),
    );

    getResult().handleStartSession();

    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("正在创建 Realtime 会话"),
    );
    // 重置已上传帧签名与计数
    expect(lastUploadedFrameSignatureRef.current).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({
      type: "frame-upload-counters-reset",
    });
    expect(startRealtimeSession).toHaveBeenCalledTimes(1);
  });

  it("自动采样开启时以 interval 模式创建会话", () => {
    const startRealtimeSession = vi.fn(() => Promise.resolve(true));
    renderHarness(makeDeps({ isAutoSampling: true, startRealtimeSession }));

    getResult().handleStartSession();

    expect(startRealtimeSession).toHaveBeenCalledWith(
      expect.objectContaining({ visualContextMode: "interval" }),
    );
  });

  it("自动采样关闭时以 manual 模式创建会话", () => {
    const startRealtimeSession = vi.fn(() => Promise.resolve(true));
    renderHarness(makeDeps({ isAutoSampling: false, startRealtimeSession }));

    getResult().handleStartSession();

    expect(startRealtimeSession).toHaveBeenCalledWith(
      expect.objectContaining({ visualContextMode: "manual" }),
    );
  });

  it("透传 turnDetectionMode / responseBudget 与空间标注指令", () => {
    const startRealtimeSession = vi.fn(() => Promise.resolve(true));
    renderHarness(
      makeDeps({
        turnDetectionMode: "push-to-talk",
        responseBudget: "brief",
        startRealtimeSession,
      }),
    );

    getResult().handleStartSession();

    expect(startRealtimeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        turnDetectionMode: "push-to-talk",
        responseBudget: "brief",
        instructions: expect.stringContaining("[ANNOTATIONS]"),
      }),
    );
  });
});
