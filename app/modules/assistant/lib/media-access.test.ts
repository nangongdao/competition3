import { describe, expect, it } from "vitest";

import {
  MEDIA_RELEASE_TRANSCRIPT,
  resolveReleaseActions,
} from "@/modules/assistant/lib/media-access";

describe("resolveReleaseActions", () => {
  it("返回完整且有序的释放动作序列", () => {
    const actions = resolveReleaseActions();

    expect(actions.map((a) => a.kind)).toEqual([
      "stop-continuous-voice",
      "cancel-voice-recording",
      "stop-session",
      "stop-access",
      "set-auto-sampling",
      "clear-last-frame",
      "reset-frame-signature",
      "reset-upload-counters",
      "set-microphone-muted",
      "add-transcript",
    ]);
  });

  it("停连续语音与取消语音录制排在会话/访问停止之前", () => {
    const actions = resolveReleaseActions();
    const kinds = actions.map((a) => a.kind);

    expect(kinds.indexOf("stop-continuous-voice")).toBeLessThan(
      kinds.indexOf("stop-session"),
    );
    expect(kinds.indexOf("cancel-voice-recording")).toBeLessThan(
      kinds.indexOf("stop-session"),
    );
  });

  it("set-auto-sampling 动作关闭自动采样", () => {
    const action = resolveReleaseActions().find(
      (a) => a.kind === "set-auto-sampling",
    );

    expect(action).toEqual({ kind: "set-auto-sampling", enabled: false });
  });

  it("set-microphone-muted 动作取消静音", () => {
    const action = resolveReleaseActions().find(
      (a) => a.kind === "set-microphone-muted",
    );

    expect(action).toEqual({ kind: "set-microphone-muted", muted: false });
  });

  it("add-transcript 动作携带释放提示文案", () => {
    const action = resolveReleaseActions().find(
      (a) => a.kind === "add-transcript",
    );

    expect(action).toEqual({
      kind: "add-transcript",
      text: MEDIA_RELEASE_TRANSCRIPT,
    });
  });
});
