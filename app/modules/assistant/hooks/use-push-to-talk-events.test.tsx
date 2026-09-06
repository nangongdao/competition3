import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePushToTalkEvents } from "./use-push-to-talk-events";
import type { UsePushToTalkEventsOptions } from "./use-push-to-talk-events";

/** 暴露 hook 返回值的模块级捕获器（供测试调用 handler）。 */
let captured: ReturnType<typeof usePushToTalkEvents> | undefined;

function Harness(props: {
  options: UsePushToTalkEventsOptions;
}): React.JSX.Element {
  const events = usePushToTalkEvents(props.options);
  captured = events;
  return <div data-testid="captured" />;
}

function getEvents(): ReturnType<typeof usePushToTalkEvents> {
  if (captured === undefined) {
    throw new Error("usePushToTalkEvents 未被捕获");
  }

  return captured;
}

/** 构造一个最小的事件对象，可被覆盖扩展。 */
function makePointerEvent(
  overrides: Partial<React.PointerEvent<HTMLButtonElement>> = {},
): React.PointerEvent<HTMLButtonElement> {
  const pointerCapture: string[] = [];
  const target = {
    setPointerCapture: (id: number) => {
      pointerCapture.push(String(id));
    },
    hasPointerCapture: (id: number) => pointerCapture.includes(String(id)),
    releasePointerCapture: (id: number) => {
      const idx = pointerCapture.indexOf(String(id));
      if (idx >= 0) {
        pointerCapture.splice(idx, 1);
      }
    },
  } as unknown as HTMLElement;

  return {
    preventDefault: vi.fn(),
    pointerId: 1,
    currentTarget: target,
    ...overrides,
  } as unknown as React.PointerEvent<HTMLButtonElement>;
}

function makeKeyEvent(
  overrides: Partial<React.KeyboardEvent<HTMLButtonElement>> = {},
): React.KeyboardEvent<HTMLButtonElement> {
  return {
    preventDefault: vi.fn(),
    key: " ",
    repeat: false,
    currentTarget: {},
    ...overrides,
  } as unknown as React.KeyboardEvent<HTMLButtonElement>;
}

function renderHarness(options: UsePushToTalkEventsOptions): void {
  captured = undefined;
  renderToStaticMarkup(<Harness options={options} />);
}

afterEach(() => {
  captured = undefined;
});

describe("usePushToTalkEvents", () => {
  it("指针按下且允许 PTT 时激活并捕获指针", () => {
    const startPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk,
      stopPushToTalk: vi.fn(),
    });

    const event = makePointerEvent();
    getEvents().handlePushToTalkPointerDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(startPushToTalk).toHaveBeenCalledTimes(1);
    expect(event.currentTarget.hasPointerCapture(1)).toBe(true);
  });

  it("指针按下但 PTT 被禁用时不激活", () => {
    const startPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: false,
      startPushToTalk,
      stopPushToTalk: vi.fn(),
    });

    getEvents().handlePushToTalkPointerDown(makePointerEvent());

    expect(startPushToTalk).not.toHaveBeenCalled();
  });

  it("指针抬起时释放指针捕获并停止 PTT", () => {
    const stopPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk: vi.fn(),
      stopPushToTalk,
    });

    const event = makePointerEvent();
    // 先按下捕获，再抬起
    getEvents().handlePushToTalkPointerDown(event);
    getEvents().handlePushToTalkPointerEnd(event);

    expect(event.currentTarget.hasPointerCapture(1)).toBe(false);
    expect(stopPushToTalk).toHaveBeenCalledTimes(1);
  });

  it("键盘按下空格且允许 PTT 时激活", () => {
    const startPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk,
      stopPushToTalk: vi.fn(),
    });

    const event = makeKeyEvent({ key: " " });
    getEvents().handlePushToTalkKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(startPushToTalk).toHaveBeenCalledTimes(1);
  });

  it("键盘按下回车且允许 PTT 时激活", () => {
    const startPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk,
      stopPushToTalk: vi.fn(),
    });

    getEvents().handlePushToTalkKeyDown(makeKeyEvent({ key: "Enter" }));

    expect(startPushToTalk).toHaveBeenCalledTimes(1);
  });

  it("键盘按下处于 auto-repeat 时不激活", () => {
    const startPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk,
      stopPushToTalk: vi.fn(),
    });

    getEvents().handlePushToTalkKeyDown(
      makeKeyEvent({ key: " ", repeat: true }),
    );

    expect(startPushToTalk).not.toHaveBeenCalled();
  });

  it("键盘按下但 PTT 被禁用时不激活", () => {
    const startPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: false,
      startPushToTalk,
      stopPushToTalk: vi.fn(),
    });

    getEvents().handlePushToTalkKeyDown(makeKeyEvent({ key: " " }));

    expect(startPushToTalk).not.toHaveBeenCalled();
  });

  it("键盘按下非激活键（如 a）时不激活", () => {
    const startPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk,
      stopPushToTalk: vi.fn(),
    });

    getEvents().handlePushToTalkKeyDown(makeKeyEvent({ key: "a" }));

    expect(startPushToTalk).not.toHaveBeenCalled();
  });

  it("键盘抬起空格时停止 PTT", () => {
    const stopPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk: vi.fn(),
      stopPushToTalk,
    });

    const event = makeKeyEvent({ key: " " });
    getEvents().handlePushToTalkKeyUp(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(stopPushToTalk).toHaveBeenCalledTimes(1);
  });

  it("键盘抬起非激活键时不停止 PTT", () => {
    const stopPushToTalk = vi.fn(() => true);
    renderHarness({
      canPushToTalk: true,
      startPushToTalk: vi.fn(),
      stopPushToTalk,
    });

    getEvents().handlePushToTalkKeyUp(makeKeyEvent({ key: "Escape" }));

    expect(stopPushToTalk).not.toHaveBeenCalled();
  });
});
