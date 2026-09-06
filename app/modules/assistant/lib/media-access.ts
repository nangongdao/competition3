/**
 * 媒体访问 / 释放编排的纯决策层。
 *
 * 将 `assistant-workspace` 主组件的 `handleRequestAccess` / `handleReleaseMedia`
 * 编排抽为可单测纯函数：`resolveReleaseActions` 把「释放媒体」需要执行的副作用序列
 * 展开为有序的判别联合 action 数组，副作用由 hook 侧注入执行。
 */

/** 「释放媒体」需要执行的一条副作用。 */
export type MediaReleaseAction =
  | { kind: "stop-continuous-voice" }
  | { kind: "cancel-voice-recording" }
  | { kind: "stop-session" }
  | { kind: "stop-access" }
  | { kind: "set-auto-sampling"; enabled: false }
  | { kind: "clear-last-frame" }
  | { kind: "reset-frame-signature" }
  | { kind: "reset-upload-counters" }
  | { kind: "set-microphone-muted"; muted: false }
  | { kind: "add-transcript"; text: string };

/** 释放后追加到转写区的系统提示文案。 */
export const MEDIA_RELEASE_TRANSCRIPT = "已关闭摄像头和麦克风。";

/** 「释放媒体」应执行的副作用序列。 */
export function resolveReleaseActions(): readonly MediaReleaseAction[] {
  return [
    { kind: "stop-continuous-voice" },
    { kind: "cancel-voice-recording" },
    { kind: "stop-session" },
    { kind: "stop-access" },
    { kind: "set-auto-sampling", enabled: false },
    { kind: "clear-last-frame" },
    { kind: "reset-frame-signature" },
    { kind: "reset-upload-counters" },
    { kind: "set-microphone-muted", muted: false },
    { kind: "add-transcript", text: MEDIA_RELEASE_TRANSCRIPT },
  ];
}
