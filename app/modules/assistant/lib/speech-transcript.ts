/**
 * 语音转写 / 语音状态回调的纯决策层。
 *
 * `assistant-workspace` 主组件中 `handleChatSpeechTranscript`（把浏览器/Worker
 * 语音识别文本合并进草稿框）与 `handleBrowserSpeechStatus`（把浏览器语音状态消息
 * 追加为系统转写）此前为内联逻辑，不可测。与 M1.12–M1.17 同理，把其中的决策抽为
 * 可单测纯函数；`setTextDraft` / `addTranscript` 副作用由 `hooks/use-speech-transcript.ts`
 * 接线执行。
 */

/** 把一次语音识别结果合并进现有草稿的结果。 */
export type DraftFillResult = {
  /** 合并后的新草稿文本。 */
  readonly draft: string;
  /** 是否发生了内容变化（供调用方决定是否提示）。 */
  readonly changed: boolean;
};

/**
 * 计算把一次语音识别结果填入输入框应得到的新草稿。
 *
 * - 现有草稿为空（或全空白）：直接用识别文本。
 * - 现有草稿非空：以单个空格拼接识别文本，避免粘连。
 *
 * 与主组件原内联逻辑行为完全一致。
 *
 * @param currentDraft  当前输入框草稿（可能含前后空白）。
 * @param recognizedText 语音识别返回的文本。
 */
export function resolveDraftFill(
  currentDraft: string,
  recognizedText: string,
): DraftFillResult {
  const trimmedCurrentDraft = currentDraft.trim();

  if (trimmedCurrentDraft.length === 0) {
    return { draft: recognizedText, changed: recognizedText.length > 0 };
  }

  return { draft: `${trimmedCurrentDraft} ${recognizedText}`, changed: true };
}
