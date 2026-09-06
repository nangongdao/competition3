import { describe, expect, it } from "vitest";

import {
  createChatStreamParser,
  parseChatDelta,
  parseChatStreamText,
} from "./chat-stream";

describe("parseChatDelta", () => {
  it("extracts content delta from a choice event", () => {
    const line = '{"choices":[{"delta":{"content":"Hello"}}]}';
    expect(parseChatDelta(line).delta).toBe("Hello");
  });

  it("returns empty delta for a role-only event", () => {
    const line = '{"choices":[{"delta":{"role":"assistant"}}]}';
    expect(parseChatDelta(line).delta).toBe("");
  });

  it("returns empty delta for [DONE]", () => {
    expect(parseChatDelta("[DONE]").delta).toBe("");
  });

  it("returns empty delta for invalid JSON", () => {
    expect(parseChatDelta("not-json").delta).toBe("");
  });

  it("returns empty delta for empty line", () => {
    expect(parseChatDelta("").delta).toBe("");
  });

  it("extracts model name when present", () => {
    const line =
      '{"model":"gpt-4o","choices":[{"delta":{"content":"hi"}}]}';
    expect(parseChatDelta(line).model).toBe("gpt-4o");
  });
});

describe("parseChatStreamText", () => {
  it("parses multiple events separated by blank lines", () => {
    const text =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n';
    const events = parseChatStreamText(text);
    expect(events).toHaveLength(2);
    expect(events[0]?.delta).toBe("Hel");
    expect(events[1]?.delta).toBe("lo");
  });

  it("parses a [DONE] event", () => {
    const events = parseChatStreamText("data: [DONE]\n\n");
    expect(events).toHaveLength(1);
    expect(events[0]?.done).toBe(true);
  });

  it("handles multi-line data payloads", () => {
    const text =
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"b"}}]}\n\n';
    expect(parseChatStreamText(text)[1]?.delta).toBe("b");
  });
});

describe("createChatStreamParser", () => {
  it("buffers partial events across push boundaries", () => {
    const parser = createChatStreamParser();
    const firstChunk = 'data: {"choices":[{"delta":{"content":"Hel';
    const eventsAfterFirst = parser.push(firstChunk);
    expect(eventsAfterFirst).toHaveLength(0);

    const secondChunk = 'lo"}}]}\n\ndata: [DONE]\n\n';
    const eventsAfterSecond = parser.push(secondChunk);
    expect(eventsAfterSecond).toHaveLength(2);
    expect(eventsAfterSecond[0]?.delta).toBe("Hello");
    expect(eventsAfterSecond[1]?.done).toBe(true);
  });

  it("handles multiple complete events in a single push", () => {
    const parser = createChatStreamParser();
    const events = parser.push(
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.delta)).toEqual(["a", "b"]);
  });

  it("flush returns remaining partial data", () => {
    const parser = createChatStreamParser();
    parser.push('data: {"choices":[{"delta":{"content":"x"}}]}\n\n');
    expect(parser.flush()).toHaveLength(0);
  });

  it("concatenates deltas across push calls", () => {
    const parser = createChatStreamParser();
    const allDeltas: string[] = [];

    for (const chunk of [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
    ]) {
      for (const event of parser.push(chunk)) {
        allDeltas.push(event.delta);
      }
    }

    expect(allDeltas.join("")).toBe("你好");
  });
});
