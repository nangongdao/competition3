import { describe, expect, it } from "vitest";

import { calculateAudioRootMeanSquare } from "./audio-utils";

describe("calculateAudioRootMeanSquare", () => {
  it("returns zero for an empty sample window", () => {
    expect(calculateAudioRootMeanSquare(new Uint8Array())).toBe(0);
  });

  it("returns zero for silence centered at the byte midpoint", () => {
    const silence = new Uint8Array([128, 128, 128, 128]);
    expect(calculateAudioRootMeanSquare(silence)).toBe(0);
  });

  it("measures a full-scale signal near its theoretical maximum", () => {
    const fullScale = new Uint8Array([0, 255, 0, 255]);
    // 255 maps to 127/128 ≈ 0.9921875, so the RMS approaches but does not
    // quite reach 1 for byte-domain samples.
    expect(calculateAudioRootMeanSquare(fullScale)).toBeCloseTo(0.996, 3);
  });

  it("is invariant to sample order", () => {
    const samplesA = new Uint8Array([0, 128, 255, 128]);
    const samplesB = new Uint8Array([128, 255, 128, 0]);
    expect(calculateAudioRootMeanSquare(samplesA)).toBeCloseTo(
      calculateAudioRootMeanSquare(samplesB),
      12,
    );
  });
});
