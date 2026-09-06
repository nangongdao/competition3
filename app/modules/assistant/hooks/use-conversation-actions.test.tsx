import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// 隔离下载副作用，捕获 downloadTextFile 调用参数。
const downloadTextFile = vi.fn();
vi.mock("@/modules/assistant/lib/download", () => ({
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
  buildDownloadDataUrl: () => "data:application/octet-stream;base64,",
}));

import { useConversationActions } from "./use-conversation-actions";
import type { UseConversationActionsOptions } from "./use-conversation-actions";
import type { TranscriptEntry } from "@/modules/assistant/types";

/** 暴露 hook 返回值的模块级捕获器（供测试调用 handler）。 */
let captured: ReturnType<typeof useConversationActions> | undefined;

function Harness(props: {
  options: UseConversationActionsOptions;
}): React.JSX.Element {
  const actions = useConversationActions(props.options);
  captured = actions;
  return <div data-testid="captured" />;
}

/** 渲染后获取捕获的 actions；若未捕获则抛出。 */
function getActions(): ReturnType<typeof useConversationActions> {
  if (captured === undefined) {
    throw new Error("useConversationActions 未被捕获");
  }

  return captured;
}

function makeOptions(
  overrides: Partial<UseConversationActionsOptions> = {},
): UseConversationActionsOptions {
  return {
    transcript: [],
    retryableChatTurns: {},
    isChatSending: false,
    hasRealtimeConnection: true,
    addTranscript: vi.fn(() => "entry-1"),
    dispatch: vi.fn(),
    cancelChatSpeech: vi.fn(),
    sendChatTurn: vi.fn(() => Promise.resolve(true)),
    setTranscriptDeliveryStatus: vi.fn(),
    setRetryableChatTurns: vi.fn(),
    setSpatialAnnotations: vi.fn(),
    setIsClearConfirmationVisible: vi.fn(),
    nextEntryIdRef: { current: 0 },
    captureFrameAsync: vi.fn(() => Promise.resolve(null)),
    recordUploadedFrame: vi.fn(),
    sendVisualContext: vi.fn(() => true),
    ...overrides,
  };
}

function renderHarness(options: UseConversationActionsOptions): void {
  captured = undefined;
  renderToStaticMarkup(<Harness options={options} />);
}

afterEach(() => {
  captured = undefined;
  downloadTextFile.mockClear();
});

describe("useConversationActions", () => {
  it("导出 JSON 时触发 json 下载", () => {
    const transcript: readonly TranscriptEntry[] = [
      {
        id: "entry-1",
        speaker: "user",
        text: "你好",
        createdAt: 1_700_000_000_000,
      },
    ];

    renderHarness(
      makeOptions({ transcript }),
    );

    getActions().handleConversationExport("json");

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [content, mime, filename] = downloadTextFile.mock.calls[0] as [
      string,
      string,
      string,
    ];

    expect(mime).toBe("application/json");
    expect(filename).toContain(".json");
    expect(content).toContain("你好");
  });

  it("清空会话时重置转写、标注、重试表并归零 id 计数", () => {
    const dispatch = vi.fn();
    const cancelChatSpeech = vi.fn();
    const setRetryableChatTurns = vi.fn();
    const setSpatialAnnotations = vi.fn();
    const setIsClearConfirmationVisible = vi.fn();
    const nextEntryIdRef = { current: 7 };

    renderHarness(
      makeOptions({
        dispatch,
        cancelChatSpeech,
        setRetryableChatTurns,
        setSpatialAnnotations,
        setIsClearConfirmationVisible,
        nextEntryIdRef,
      }),
    );

    getActions().handleClearConversation();

    expect(cancelChatSpeech).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "transcript-cleared" });
    expect(setRetryableChatTurns).toHaveBeenCalledWith({});
    expect(setSpatialAnnotations).toHaveBeenCalledWith([]);
    expect(setIsClearConfirmationVisible).toHaveBeenCalledWith(false);
    expect(nextEntryIdRef.current).toBe(0);
  });

  it("有可重试载荷且未发送中时重试 Chat 回合", () => {
    const setTranscriptDeliveryStatus = vi.fn();
    const sendChatTurn = vi.fn(() => Promise.resolve(true));
    const retryInput = { message: "再试一次" };

    renderHarness(
      makeOptions({
        retryableChatTurns: { "entry-1": retryInput },
        isChatSending: false,
        setTranscriptDeliveryStatus,
        sendChatTurn,
      }),
    );

    getActions().handleRetryChatTurn("entry-1");

    expect(setTranscriptDeliveryStatus).toHaveBeenCalledWith("entry-1", "sent");
    expect(sendChatTurn).toHaveBeenCalledWith({
      userEntryId: "entry-1",
      ...retryInput,
    });
  });

  it("发送中时不允许重试", () => {
    const setTranscriptDeliveryStatus = vi.fn();
    const sendChatTurn = vi.fn(() => Promise.resolve(true));

    renderHarness(
      makeOptions({
        retryableChatTurns: { "entry-1": { message: "再试一次" } },
        isChatSending: true,
        setTranscriptDeliveryStatus,
        sendChatTurn,
      }),
    );

    getActions().handleRetryChatTurn("entry-1");

    expect(setTranscriptDeliveryStatus).not.toHaveBeenCalled();
    expect(sendChatTurn).not.toHaveBeenCalled();
  });

  it("Realtime 已连接时手动采样并发送视觉上下文", async () => {
    const captureFrameAsync = vi.fn(() =>
      Promise.resolve({
        frameDataUrl: "data:image/jpeg;base64,frame",
        signature: { width: 640, height: 360, luma: [1, 2, 3] },
      }),
    );
    const recordUploadedFrame = vi.fn();
    const sendVisualContext = vi.fn(() => true);
    const addTranscript = vi.fn(() => "entry-1");

    renderHarness(
      makeOptions({
        hasRealtimeConnection: true,
        captureFrameAsync,
        recordUploadedFrame,
        sendVisualContext,
        addTranscript,
      }),
    );

    await getActions().handleManualFrameCapture();

    expect(captureFrameAsync).toHaveBeenCalledWith("manual");
    expect(sendVisualContext).toHaveBeenCalledWith({
      frameDataUrl: "data:image/jpeg;base64,frame",
      prompt: expect.stringContaining("手动采样"),
      requestResponse: false,
    });
    expect(recordUploadedFrame).toHaveBeenCalled();
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("Realtime"),
    );
  });

  it("Realtime 未连接时不发送视觉上下文", async () => {
    const captureFrameAsync = vi.fn(() =>
      Promise.resolve({
        frameDataUrl: "data:image/jpeg;base64,frame",
        signature: { width: 640, height: 360, luma: [1, 2, 3] },
      }),
    );
    const recordUploadedFrame = vi.fn();
    const sendVisualContext = vi.fn(() => true);

    renderHarness(
      makeOptions({
        hasRealtimeConnection: false,
        captureFrameAsync,
        recordUploadedFrame,
        sendVisualContext,
      }),
    );

    await getActions().handleManualFrameCapture();

    expect(sendVisualContext).not.toHaveBeenCalled();
    expect(recordUploadedFrame).not.toHaveBeenCalled();
  });
});
