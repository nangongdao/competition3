import { describe, expect, it } from "vitest";

import { buildResponseCreateEvent } from "./use-realtime-session";

describe("buildResponseCreateEvent", () => {
  it("requests audio and text responses by default mode", () => {
    expect(buildResponseCreateEvent("audio-text")).toEqual({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  });

  it("requests text-only responses when the mode is text-only", () => {
    expect(buildResponseCreateEvent("text-only")).toEqual({
      type: "response.create",
      response: {
        modalities: ["text"],
      },
    });
  });
});
