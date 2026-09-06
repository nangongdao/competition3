import { describe, expect, it } from "vitest";

import { resolveStartPrerequisite } from "./use-realtime-session-start";

describe("resolveStartPrerequisite", () => {
  it("returns an error when the media stream is missing", () => {
    expect(
      resolveStartPrerequisite(false, true, true),
    ).toBe("启动 Realtime 前请先授权摄像头和麦克风。");
  });

  it("returns an error when there is no audio track", () => {
    expect(
      resolveStartPrerequisite(true, false, true),
    ).toBe("当前没有可用于 Realtime 的麦克风音频轨道。");
  });

  it("returns an error when WebRTC is unsupported", () => {
    expect(
      resolveStartPrerequisite(true, true, false),
    ).toBe("当前浏览器不支持 WebRTC 点对点连接。");
  });

  it("returns null when all prerequisites are met", () => {
    expect(resolveStartPrerequisite(true, true, true)).toBeNull();
  });

  it("prioritizes the stream check over later checks", () => {
    // 即使后续检查也失败，也应先报告缺失的媒体流。
    expect(resolveStartPrerequisite(false, false, false)).toBe(
      "启动 Realtime 前请先授权摄像头和麦克风。",
    );
  });
});
