import { describe, expect, it } from "vitest";

import {
  resolveVisionCapability,
  type VisionCapability,
} from "./vision-capability";

describe("resolveVisionCapability", () => {
  it("returns multi-image when explicitly enabled", () => {
    expect(resolveVisionCapability("unknown-model", "enabled")).toBe("multi-image");
  });

  it("returns none when explicitly disabled", () => {
    expect(resolveVisionCapability("gpt-4o", "disabled")).toBe("none");
  });

  it("resolves known vision models from the model table", () => {
    expect(resolveVisionCapability("gpt-4o", undefined)).toBe("multi-image");
    expect(
      resolveVisionCapability("Qwen/Qwen2.5-VL-72B-Instruct", undefined),
    ).toBe("multi-image");
    expect(resolveVisionCapability("Qwen/Qwen2-VL-7B-Instruct", undefined)).toBe(
      "single-image",
    );
  });

  it("returns none for known non-vision models", () => {
    expect(resolveVisionCapability("nex-agi/Nex-N2-Pro", undefined)).toBe("none");
  });

  it("falls back to none for unknown models without an explicit mode", () => {
    expect(resolveVisionCapability("some/provider-model", undefined)).toBe("none");
  });

  it("returns none when the model is missing", () => {
    expect(resolveVisionCapability(undefined, undefined)).toBe("none");
  });

  it("ignores surrounding whitespace in the model name", () => {
    const capability: VisionCapability = resolveVisionCapability(
      "  gpt-4o  ",
      undefined,
    );

    expect(capability).toBe("multi-image");
  });
});
