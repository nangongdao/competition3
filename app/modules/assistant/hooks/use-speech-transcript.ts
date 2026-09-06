/**
 * 语音转写 / 语音状态回调收敛 hook。
 *
 * 收敛 `assistant-workspace` 主组件中内联的
 * `handleChatSpeechTranscript`（把语音识别文本合并进草稿框）与
 * `handleBrowserSpeechStatus`（把浏览器语音状态消息追加为系统转写）。
 *
 * 草稿合并决策沉淀为纯函数 `resolveDraftFill`（`lib/speech-transcript.ts`），
 * 由纯函数单测覆盖；本 hook 仅保留 `setTextDraft` / `addTranscript` 副作用接线。
 */

import { useCallback } from "react";

import type { TranscriptSpeaker } from "@/modules/assistant/types";

import { resolveDraftFill } from "@/modules/assistant/lib/speech-transcript";

export type SpeechTranscriptInput = {
  /** 更新草稿框内容的 setState（来自 useState<textDraft>）。 */
  setTextDraft: React.Dispatch<React.SetStateAction<string>>;
  /** 追加一条转写记录。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
  ) => string;
};

export type SpeechTranscriptResult = {
  /** 把语音识别文本合并进草稿框，并追加一条系统提示。 */
  handleChatSpeechTranscript: (recognizedText: string) => void;
  /** 把一条浏览器语音状态消息追加为系统转写。 */
  handleBrowserSpeechStatus: (message: string) => void;
};

/**
 * 收敛语音识别文本/状态回调，行为与主组件原内联逻辑完全一致。
 */
export function useSpeechTranscript({
  setTextDraft,
  addTranscript,
}: SpeechTranscriptInput): SpeechTranscriptResult {
  const handleChatSpeechTranscript = useCallback(
    (recognizedText: string): void => {
      setTextDraft((currentDraft) =>
        resolveDraftFill(currentDraft, recognizedText).draft,
      );
      addTranscript("system", "语音识别结果已填入输入框。");
    },
    [addTranscript, setTextDraft],
  );

  const handleBrowserSpeechStatus = useCallback(
    (message: string): void => {
      addTranscript("system", message);
    },
    [addTranscript],
  );

  return { handleChatSpeechTranscript, handleBrowserSpeechStatus };
}
