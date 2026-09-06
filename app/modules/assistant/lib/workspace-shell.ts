import type { TranscriptEntry } from "@/modules/assistant/types";

/**
 * 构建工作台首次挂载时的初始转写条目（系统就绪提示 + 助手欢迎语）。
 *
 * 从主组件中收敛为可单测的纯函数：`createdAt` 缺省时取当前时间，
 * id 从 `0` 起递增（与主组件 `nextEntryIdRef` 初值 `initialTranscript.length` 对齐）。
 */
export function buildInitialTranscript(
  now: number = Date.now(),
): readonly TranscriptEntry[] {
  return [
    {
      id: "entry-0",
      speaker: "system",
      text: "系统已就绪。",
      createdAt: now,
    },
    {
      id: "entry-1",
      speaker: "assistant",
      text: "Worker 会安全保管 OPENAI_API_KEY 和 OPENAI_CHAT_MODEL。你可以使用 Chat Completions，也可以切换到 Realtime 模式进行低延迟语音对话。",
      createdAt: now,
    },
  ] as const;
}
