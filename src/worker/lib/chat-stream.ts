/**
 * Chat Completions SSE 流解析工具。
 *
 * 从上游（OpenAI 兼容）的 `text/event-stream` 文本增量中提取
 * `choices[0].delta.content` 增量内容，并识别 `[DONE]` 结束标记。
 *
 * 流式读取天然存在 chunk 边界：一个网络 chunk 可能只包含一个事件的
 * 一部分，也可能一次包含多个完整事件。因此本模块提供带内部缓冲的
 * 增量解析器，逐事件消费。
 */

/** 单个事件解析结果。 */
export type ChatStreamEvent = {
  /** 本次增量内容（可能为空字符串，例如仅含 role 增量的事件）。 */
  delta: string;
  /** 上游返回的模型名（若该事件包含）。 */
  model?: string;
  /** 上游已发送结束标记 `[DONE]`。 */
  done: boolean;
};

const DONE_EVENT = "[DONE]";

/**
 * 从一条 SSE `data:` 行中提取增量内容。
 *
 * OpenAI 兼容格式：`{"choices":[{"delta":{"content":"..."}}]}`。
 * 返回 `{ delta, model }`；无法解析或为空则返回空增量。
 */
export function parseChatDelta(
  dataLine: string,
): { delta: string; model?: string } {
  const trimmed = dataLine.trim();

  if (trimmed.length === 0 || trimmed === DONE_EVENT) {
    return { delta: "" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { delta: "" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { delta: "" };
  }

  const record = parsed as Record<string, unknown>;
  const model =
    typeof record.model === "string" && record.model.trim().length > 0
      ? record.model.trim()
      : undefined;

  if (!Array.isArray(record.choices)) {
    return { delta: "", model };
  }

  const firstChoice = record.choices[0];

  if (typeof firstChoice !== "object" || firstChoice === null) {
    return { delta: "", model };
  }

  const delta = (firstChoice as Record<string, unknown>).delta;

  if (typeof delta !== "object" || delta === null) {
    return { delta: "", model };
  }

  const content = (delta as Record<string, unknown>).content;

  return {
    delta: typeof content === "string" ? content : "",
    model,
  };
}

/** 从一整段 SSE 文本中解析出所有事件。 */
export function parseChatStreamText(
  text: string,
): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [];
  let currentDataLines: string[] = [];

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    if (rawLine === "") {
      // 空行表示事件结束
      if (currentDataLines.length > 0) {
        events.push(extractEvent(currentDataLines));
        currentDataLines = [];
      }
      continue;
    }

    if (rawLine.startsWith("data:")) {
      currentDataLines.push(rawLine.slice(5).trimStart());
    }
  }

  return events;
}

function extractEvent(dataLines: string[]): ChatStreamEvent {
  const joined = dataLines.join("\n");

  if (joined === DONE_EVENT) {
    return { delta: "", done: true };
  }

  const { delta, model } = parseChatDelta(joined);

  return { delta, model, done: false };
}

/**
 * 带内部缓冲的增量流解析器。
 *
 * 用法：
 *   const parser = createChatStreamParser();
 *   for await (const chunk of reader) {
 *     for (const event of parser.push(decoder.decode(chunk, { stream: true }))) {
 *       // 消费 event
 *     }
 *   }
 *   for (const event of parser.flush()) {
 *     // 消费尾部未完成事件（若需要）
 *   }
 */
export function createChatStreamParser(): {
  push: (text: string) => ChatStreamEvent[];
  flush: () => ChatStreamEvent[];
} {
  let buffer = "";

  function parseBuffered(): ChatStreamEvent[] {
    // 只处理以空行结束的完整事件；未结束的残片留在 buffer
    const events: ChatStreamEvent[] = [];
    let searchFrom = 0;

    while (true) {
      const boundaryIndex = buffer.indexOf("\n\n", searchFrom);

      if (boundaryIndex === -1) {
        break;
      }

      const completeEventText = buffer.slice(0, boundaryIndex + 2);
      buffer = buffer.slice(boundaryIndex + 2);

      const parsedEvents = parseChatStreamText(completeEventText);

      for (const event of parsedEvents) {
        events.push(event);
      }

      searchFrom = 0;
    }

    return events;
  }

  return {
    push(text: string): ChatStreamEvent[] {
      buffer += text;
      return parseBuffered();
    },
    flush(): ChatStreamEvent[] {
      const events: ChatStreamEvent[] = [];

      if (buffer.trim().length > 0) {
        events.push(...parseChatStreamText(buffer));
        buffer = "";
      }

      return events;
    },
  };
}
