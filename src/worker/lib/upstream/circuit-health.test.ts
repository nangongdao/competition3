import { describe, expect, it } from "vitest";

import type { CloudflareBindings } from "../../types";
import {
  readCircuitHealthShards,
  resolveCircuitOperationOrigin,
} from "./circuit-health";

function makeEnv(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return overrides as CloudflareBindings;
}

describe("resolveCircuitOperationOrigin", () => {
  it("resolves chat origin from the chat base URL", () => {
    const env = makeEnv({ OPENAI_CHAT_BASE_URL: "https://chat.example.com/v1" });

    expect(resolveCircuitOperationOrigin(env, "chat")).toBe(
      "https://chat.example.com",
    );
  });

  it("resolves realtime origin from the realtime base URL", () => {
    const env = makeEnv({ OPENAI_REALTIME_BASE_URL: "https://rt.example.com" });

    expect(resolveCircuitOperationOrigin(env, "realtime")).toBe(
      "https://rt.example.com",
    );
  });

  it("resolves transcription origin from the transcription base URL", () => {
    const env = makeEnv({
      OPENAI_TRANSCRIPTION_BASE_URL: "https://asr.example.com/v1",
    });

    expect(resolveCircuitOperationOrigin(env, "transcription")).toBe(
      "https://asr.example.com",
    );
  });

  it("falls back to the shared OPENAI_BASE_URL for each operation", () => {
    const env = makeEnv({ OPENAI_BASE_URL: "https://shared.example.com/v1" });

    expect(resolveCircuitOperationOrigin(env, "chat")).toBe(
      "https://shared.example.com",
    );
    expect(resolveCircuitOperationOrigin(env, "realtime")).toBe(
      "https://shared.example.com",
    );
    expect(resolveCircuitOperationOrigin(env, "transcription")).toBe(
      "https://shared.example.com",
    );
  });

  it("returns the default OpenAI origin when no base URL is configured", () => {
    expect(resolveCircuitOperationOrigin(makeEnv(), "chat")).toBe(
      "https://api.openai.com",
    );
  });

  it("returns null for an unparseable base URL", () => {
    const env = makeEnv({ OPENAI_BASE_URL: "not a url" });

    expect(resolveCircuitOperationOrigin(env, "chat")).toBeNull();
  });

  it("returns null for a blank base URL", () => {
    const env = makeEnv({ OPENAI_CHAT_BASE_URL: "   " });

    expect(resolveCircuitOperationOrigin(env, "chat")).toBeNull();
  });
});

describe("readCircuitHealthShards", () => {
  it("returns an empty list when the binding is missing", async () => {
    const shards = await readCircuitHealthShards({
      env: makeEnv(),
      namespace: undefined,
    });

    expect(shards).toEqual([]);
  });
});
