import { describe, expect, it } from "vitest";

import { createSseParser, parseSseDataLine, parseSseDataLines } from "./sse-parser";

describe("parseSseDataLine", () => {
  it("parses JSON data", () => {
    const event = parseSseDataLine('{"success":true,"delta":"Hello"}');
    expect(event.done).toBe(false);
    expect(event.data).toMatchObject({ success: true, delta: "Hello" });
  });

  it("marks [DONE] as done", () => {
    const event = parseSseDataLine("[DONE]");
    expect(event.done).toBe(true);
    expect(event.data).toBeNull();
  });

  it("returns null data for invalid JSON", () => {
    const event = parseSseDataLine("not-json");
    expect(event.data).toBeNull();
    expect(event.done).toBe(false);
  });
});

describe("parseSseDataLines", () => {
  it("extracts data lines from blocks", () => {
    const lines = parseSseDataLines(
      'data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n',
    );
    expect(lines).toEqual(['{"a":1}', '{"b":2}', "[DONE]"]);
  });
});

describe("createSseParser", () => {
  it("buffers partial events across push boundaries", () => {
    const parser = createSseParser();
    expect(parser.push('data: {"delta":"Hel')).toHaveLength(0);

    const events = parser.push('lo"}\n\ndata: [DONE]\n\n');
    expect(events).toHaveLength(2);
    expect(events[0]?.data).toMatchObject({ delta: "Hello" });
    expect(events[1]?.done).toBe(true);
  });

  it("handles multiple complete events in a single push", () => {
    const parser = createSseParser();
    const events = parser.push(
      'data: {"delta":"a"}\n\ndata: {"delta":"b"}\n\n',
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.data)).toMatchObject([{ delta: "a" }, { delta: "b" }]);
  });

  it("concatenates deltas across chunks", () => {
    const parser = createSseParser();
    const deltas: string[] = [];

    for (const chunk of [
      'data: {"delta":"你"}\n\n',
      'data: {"delta":"好"}\n\n',
    ]) {
      for (const event of parser.push(chunk)) {
        const data = event.data as Record<string, unknown> | null;
        if (data !== null && typeof data.delta === "string") {
          deltas.push(data.delta);
        }
      }
    }

    expect(deltas.join("")).toBe("你好");
  });

  it("flush returns remaining data", () => {
    const parser = createSseParser();
    parser.push('data: {"delta":"x"}\n\n');
    expect(parser.flush()).toHaveLength(0);
  });
});
