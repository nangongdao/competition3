/**
 * 前端 SSE（Server-Sent Events）解析器。
 *
 * 用于消费 Worker `/api/chat/completion` 返回的 `text/event-stream` 流，
 * 将增量 `data:` 事件解析为结构化对象，并识别 `[DONE]` 结束标记。
 *
 * 流式读取存在 chunk 边界：一个网络 chunk 可能只包含事件的一部分。
 * 本解析器维护内部缓冲区，逐事件消费，保证不丢失跨 chunk 的数据。
 */

export type SseEvent = {
  /** 解析后的 JSON 数据（若可解析），否则为 null。 */
  data: unknown;
  /** 原始 data 行内容（`[DONE]` 时为该字面量）。 */
  raw: string;
  /** 是否为 `[DONE]` 结束标记。 */
  done: boolean;
};

/**
 * 从单个 `data:` 行解析出事件。
 */
export function parseSseDataLine(line: string): SseEvent {
  const trimmed = line.trim();

  if (trimmed === "[DONE]") {
    return { data: null, raw: trimmed, done: true };
  }

  let data: unknown = null;

  try {
    data = JSON.parse(trimmed) as unknown;
  } catch {
    data = null;
  }

  return { data, raw: trimmed, done: false };
}

/**
 * 从一整段 SSE 文本中提取 `data:` 行集合（不含跨块缓冲逻辑）。
 */
export function parseSseDataLines(text: string): string[] {
  const lines: string[] = [];

  for (const block of text.split(/\r?\n\r?\n/)) {
    const trimmedBlock = block.trim();

    if (trimmedBlock.length === 0) {
      continue;
    }

    for (const line of trimmedBlock.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        lines.push(line.slice(5).trimStart());
      }
    }
  }

  return lines;
}

/**
 * 带内部缓冲的增量 SSE 解析器。
 *
 * 用法：
 *   const parser = createSseParser();
 *   for await (const chunk of reader) {
 *     const events = parser.push(decoder.decode(chunk, { stream: true }));
 *     for (const event of events) { /* 消费事件 *\/ }
 *   }
 */
export function createSseParser(): {
  push: (text: string) => SseEvent[];
  flush: () => SseEvent[];
} {
  let buffer = "";

  function drain(): SseEvent[] {
    const events: SseEvent[] = [];

    while (true) {
      const boundaryIndex = buffer.indexOf("\n\n");

      if (boundaryIndex === -1) {
        break;
      }

      const completeBlock = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      for (const dataLine of parseSseDataLines(completeBlock)) {
        events.push(parseSseDataLine(dataLine));
      }
    }

    return events;
  }

  return {
    push(text: string): SseEvent[] {
      buffer += text;
      return drain();
    },
    flush(): SseEvent[] {
      const events: SseEvent[] = [];

      if (buffer.trim().length > 0) {
        for (const dataLine of parseSseDataLines(buffer)) {
          events.push(parseSseDataLine(dataLine));
        }

        buffer = "";
      }

      return events;
    },
  };
}
