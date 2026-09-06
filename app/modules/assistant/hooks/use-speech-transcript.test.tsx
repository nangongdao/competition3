import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSpeechTranscript } from "./use-speech-transcript";
import type { SpeechTranscriptInput } from "./use-speech-transcript";

/** 暴露 hook 返回值的模块级捕获器（供测试调用 handler）。 */
let captured: ReturnType<typeof useSpeechTranscript> | undefined;

function Harness(props: { deps: SpeechTranscriptInput }): React.JSX.Element {
  const result = useSpeechTranscript(props.deps);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): ReturnType<typeof useSpeechTranscript> {
  if (captured === undefined) {
    throw new Error("useSpeechTranscript 未被捕获");
  }

  return captured;
}

/** 捕获 setTextDraft 传入的 updater，并返回模拟 setter 与已捕获 updater 列表。 */
function makeDeps() {
  const updaters: ((draft: string) => string)[] = [];
  const setTextDraft = vi.fn((fn: (draft: string) => string) => {
    updaters.push(fn);
  }) as unknown as SpeechTranscriptInput["setTextDraft"];
  const addTranscript = vi.fn(() => "entry-1");
  return { setTextDraft, addTranscript, updaters };
}

function renderHarness(deps: SpeechTranscriptInput): void {
  captured = undefined;
  renderToStaticMarkup(<Harness deps={deps} />);
}

afterEach(() => {
  captured = undefined;
});

describe("useSpeechTranscript", () => {
  it("handleChatSpeechTranscript 空草稿直接填入识别文本", () => {
    const { setTextDraft, addTranscript, updaters } = makeDeps();
    renderHarness({ setTextDraft, addTranscript });

    getResult().handleChatSpeechTranscript("你好");

    expect(updaters).toHaveLength(1);
    expect(updaters[0]?.("")).toBe("你好");
    expect(addTranscript).toHaveBeenCalledWith("system", "语音识别结果已填入输入框。");
  });

  it("handleChatSpeechTranscript 非空草稿单空格拼接", () => {
    const { setTextDraft, addTranscript, updaters } = makeDeps();
    renderHarness({ setTextDraft, addTranscript });

    getResult().handleChatSpeechTranscript("怎么样？");

    expect(updaters[0]?.("今天天气")).toBe("今天天气 怎么样？");
    expect(addTranscript).toHaveBeenCalledTimes(1);
  });

  it("handleBrowserSpeechStatus 追加为系统转写，不触碰草稿", () => {
    const { setTextDraft, addTranscript } = makeDeps();
    renderHarness({ setTextDraft, addTranscript });

    getResult().handleBrowserSpeechStatus("语音识别不可用。");

    expect(setTextDraft).not.toHaveBeenCalled();
    expect(addTranscript).toHaveBeenCalledWith("system", "语音识别不可用。");
  });
});
