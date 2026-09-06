import { describe, expect, it } from "vitest";

import {
  visionCapabilityBadgeLevels,
  visionCapabilityDetailLabels,
  visionCapabilityLabels,
} from "@/modules/assistant/lib/workspace-labels";

describe("vision capability labels", () => {
  it("maps every capability to a badge text key", () => {
    expect(visionCapabilityLabels).toEqual({
      none: "labels.vision.none",
      "single-image": "labels.vision.singleImage",
      "multi-image": "labels.vision.multiImage",
    });
  });

  it("maps every capability to a detail text key", () => {
    expect(visionCapabilityDetailLabels).toEqual({
      none: "labels.vision.detailNone",
      "single-image": "labels.vision.detailSingleImage",
      "multi-image": "labels.vision.detailMultiImage",
    });
  });

  it("grades capabilities with the expected semantic level", () => {
    expect(visionCapabilityBadgeLevels).toEqual({
      none: "warning",
      "single-image": "info",
      "multi-image": "success",
    });
  });
});
