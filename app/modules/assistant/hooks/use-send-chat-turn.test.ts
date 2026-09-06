import { describe, expect, it } from "vitest";

import { buildRetryableChatTurn } from "./use-send-chat-turn";

describe("buildRetryableChatTurn", () => {
  it("keeps message only when no frame is attached", () => {
    const turn = buildRetryableChatTurn({
      userEntryId: "entry-1",
      message: "你好",
    });

    expect(turn).toEqual({ message: "你好" });
  });

  it("carries the frame data url and signature when present", () => {
    const signature = { width: 640, height: 360, luma: [1, 2, 3] };
    const turn = buildRetryableChatTurn({
      userEntryId: "entry-2",
      message: "这是什么",
      imageDataUrl: "data:image/jpeg;base64,xxx",
      signature,
      awaitSpeech: true,
      forceSpeech: true,
    });

    expect(turn).toEqual({
      message: "这是什么",
      imageDataUrl: "data:image/jpeg;base64,xxx",
      signature,
    });
  });

  it("drops one-time speech flags (awaitSpeech / forceSpeech)", () => {
    const turn = buildRetryableChatTurn({
      userEntryId: "entry-3",
      message: "再试一次",
      awaitSpeech: true,
      forceSpeech: true,
    });

    expect(turn).not.toHaveProperty("awaitSpeech");
    expect(turn).not.toHaveProperty("forceSpeech");
  });
});
