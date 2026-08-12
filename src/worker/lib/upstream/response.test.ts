import { describe, expect, it } from "vitest";

import {
  readJsonResponseBounded,
  readResponseTextBounded,
} from "./response";

describe("bounded upstream response reads", () => {
  it("parses JSON within the configured byte limit", async () => {
    const result = await readJsonResponseBounded(
      Response.json({ answer: "ok" }),
      128,
    );

    expect(result).toEqual({
      value: { answer: "ok" },
      text: '{"answer":"ok"}',
      truncated: false,
    });
  });

  it("truncates oversized response bodies", async () => {
    const result = await readResponseTextBounded(new Response("abcdef"), 3);

    expect(result).toEqual({
      text: "abc",
      truncated: true,
    });
  });

  it("does not parse truncated JSON", async () => {
    const result = await readJsonResponseBounded(
      new Response('{"answer":"oversized"}'),
      8,
    );

    expect(result.value).toBeNull();
    expect(result.truncated).toBe(true);
  });
});
