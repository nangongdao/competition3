import { describe, expect, it, vi } from "vitest";

import {
  dispatchRealtimeTurn,
  dispatchTextMessage,
  type RealtimeTurnDeps,
  type TextMessageDeps,
} from "./use-message-send";

function makeTextDeps(overrides: Partial<TextMessageDeps> = {}): TextMessageDeps {
  return {
    addTranscript: vi.fn(() => "entry-1"),
    sendChatTurn: vi.fn(() => Promise.resolve(true)),
    sendTextMessage: vi.fn(() => true),
    clearDraft: vi.fn(),
    ...overrides,
  };
}

describe("dispatchTextMessage", () => {
  it("ignores an empty draft", () => {
    const deps = makeTextDeps();
    const consumed = dispatchTextMessage("   ", true, true, deps);

    expect(consumed).toBe(false);
    expect(deps.addTranscript).not.toHaveBeenCalled();
    expect(deps.sendChatTurn).not.toHaveBeenCalled();
    expect(deps.sendTextMessage).not.toHaveBeenCalled();
  });

  it("routes to Chat Completions in chat mode and clears the draft", () => {
    const deps = makeTextDeps();
    const consumed = dispatchTextMessage("你好", true, true, deps);

    expect(consumed).toBe(true);
    expect(deps.addTranscript).toHaveBeenCalledWith("user", "你好", "sent");
    expect(deps.sendChatTurn).toHaveBeenCalledWith({
      userEntryId: "entry-1",
      message: "你好",
    });
    expect(deps.clearDraft).toHaveBeenCalled();
    expect(deps.sendTextMessage).not.toHaveBeenCalled();
  });

  it("warns when Realtime text is submitted before a connection exists", () => {
    const deps = makeTextDeps();
    const consumed = dispatchTextMessage("你好", false, false, deps);

    expect(consumed).toBe(true);
    expect(deps.addTranscript).toHaveBeenCalledWith(
      "system",
      "请先启动 Realtime 会话再发送文本。",
    );
    expect(deps.sendTextMessage).not.toHaveBeenCalled();
  });

  it("routes to Realtime in realtime mode and clears the draft", () => {
    const deps = makeTextDeps();
    const consumed = dispatchTextMessage("你好", false, true, deps);

    expect(consumed).toBe(true);
    expect(deps.sendTextMessage).toHaveBeenCalledWith("你好");
    expect(deps.addTranscript).toHaveBeenCalledWith("user", "你好");
    expect(deps.clearDraft).toHaveBeenCalled();
    expect(deps.sendChatTurn).not.toHaveBeenCalled();
  });

  it("reports a failed Realtime send without clearing the draft", () => {
    const deps = makeTextDeps({ sendTextMessage: vi.fn(() => false) });
    const consumed = dispatchTextMessage("你好", false, true, deps);

    expect(consumed).toBe(true);
    expect(deps.addTranscript).toHaveBeenCalledWith(
      "system",
      "Realtime 通道未就绪，文本发送失败。",
    );
    expect(deps.clearDraft).not.toHaveBeenCalled();
  });
});

const frame = {
  frameDataUrl: "data:image/jpeg;base64,frame",
  signature: { width: 640, height: 360, luma: [1, 2, 3] },
};

function makeTurnDeps(overrides: Partial<RealtimeTurnDeps> = {}): RealtimeTurnDeps {
  return {
    addTranscript: vi.fn(() => "entry-1"),
    dispatch: vi.fn(),
    sendChatTurn: vi.fn(() => Promise.resolve(true)),
    sendVisualContext: vi.fn(() => true),
    captureFrameAsync: vi.fn(() => Promise.resolve(frame)),
    recordUploadedFrame: vi.fn(),
    ...overrides,
  };
}

describe("dispatchRealtimeTurn", () => {
  it("requests camera access before asking a visual question in chat mode", async () => {
    const deps = makeTurnDeps();
    await dispatchRealtimeTurn(true, false, true, "ready", deps);

    expect(deps.addTranscript).toHaveBeenCalledWith(
      "system",
      "请先授权摄像头后再提问。",
    );
    expect(deps.captureFrameAsync).not.toHaveBeenCalled();
  });

  it("sends a sampled frame via Chat in chat mode", async () => {
    const deps = makeTurnDeps();
    await dispatchRealtimeTurn(true, true, true, "ready", deps);

    expect(deps.captureFrameAsync).toHaveBeenCalledWith("manual");
    expect(deps.sendChatTurn).toHaveBeenCalledWith({
      userEntryId: "entry-1",
      message: "请描述你现在看到的画面。",
      imageDataUrl: frame.frameDataUrl,
      signature: frame.signature,
    });
    expect(deps.sendVisualContext).not.toHaveBeenCalled();
  });

  it("ignores Realtime visual question when not listening", async () => {
    const deps = makeTurnDeps();
    await dispatchRealtimeTurn(false, true, true, "ready", deps);

    expect(deps.captureFrameAsync).not.toHaveBeenCalled();
    expect(deps.sendVisualContext).not.toHaveBeenCalled();
  });

  it("sends a sampled frame via Realtime and records it", async () => {
    const deps = makeTurnDeps();
    await dispatchRealtimeTurn(false, true, true, "listening", deps);

    expect(deps.captureFrameAsync).toHaveBeenCalledWith("manual");
    expect(deps.sendVisualContext).toHaveBeenCalledWith({
      frameDataUrl: frame.frameDataUrl,
      prompt: "请描述你现在看到的画面。",
      requestResponse: true,
    });
    expect(deps.recordUploadedFrame).toHaveBeenCalledWith(frame.signature);
    expect(deps.addTranscript).toHaveBeenCalledWith(
      "system",
      "已把画面发送给 Realtime 模型。",
    );
  });

  it("sets an error phase when the Realtime channel is not ready", async () => {
    const deps = makeTurnDeps({ sendVisualContext: vi.fn(() => false) });
    await dispatchRealtimeTurn(false, true, true, "listening", deps);

    expect(deps.dispatch).toHaveBeenCalledWith({ type: "phase-set", phase: "error" });
    expect(deps.addTranscript).toHaveBeenCalledWith(
      "system",
      "Realtime 通道未就绪，画面发送失败。",
    );
    expect(deps.recordUploadedFrame).not.toHaveBeenCalled();
  });
});
