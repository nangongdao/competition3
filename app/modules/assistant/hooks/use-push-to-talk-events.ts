import { useCallback } from "react";

import {
  isPushToTalkActivationKey,
  isPushToTalkReleaseKey,
} from "@/modules/assistant/lib/push-to-talk";

export type UsePushToTalkEventsOptions = {
  /** 当前是否允许按住说话。 */
  canPushToTalk: boolean;
  /** 激活 PTT（开始说话）。 */
  startPushToTalk: () => boolean;
  /** 释放 PTT（结束说话）。 */
  stopPushToTalk: () => boolean;
};

export type UsePushToTalkEventsResult = {
  /** 指针按下（鼠标/触控按住 PTT 按钮）。 */
  handlePushToTalkPointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  /** 指针抬起 / 取消（松开 PTT 按钮）。 */
  handlePushToTalkPointerEnd: (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  /** 键盘按下（空格 / 回车激活 PTT）。 */
  handlePushToTalkKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => void;
  /** 键盘抬起（空格 / 回车释放 PTT）。 */
  handlePushToTalkKeyUp: (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => void;
};

/**
 * PTT（按住说话）事件封装 hook。
 *
 * 收敛 `assistant-workspace` 主组件中散落的 4 个 PTT 事件 handler，
 * 将键位 / 可用性守卫委托给 `lib/push-to-talk.ts` 的纯函数，
 * 组件仅接线指针与键盘事件副作用。
 */
export function usePushToTalkEvents({
  canPushToTalk,
  startPushToTalk,
  stopPushToTalk,
}: UsePushToTalkEventsOptions): UsePushToTalkEventsResult {
  const handlePushToTalkPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (!canPushToTalk) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      startPushToTalk();
    },
    [canPushToTalk, startPushToTalk],
  );

  const handlePushToTalkPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      stopPushToTalk();
    },
    [stopPushToTalk],
  );

  const handlePushToTalkKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (
        !isPushToTalkActivationKey(event.key, canPushToTalk, event.repeat)
      ) {
        return;
      }

      event.preventDefault();
      startPushToTalk();
    },
    [canPushToTalk, startPushToTalk],
  );

  const handlePushToTalkKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (!isPushToTalkReleaseKey(event.key)) {
        return;
      }

      event.preventDefault();
      stopPushToTalk();
    },
    [stopPushToTalk],
  );

  return {
    handlePushToTalkPointerDown,
    handlePushToTalkPointerEnd,
    handlePushToTalkKeyDown,
    handlePushToTalkKeyUp,
  };
}
