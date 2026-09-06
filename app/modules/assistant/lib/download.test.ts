import { describe, expect, it } from "vitest";

import { buildDownloadDataUrl } from "./download";

describe("buildDownloadDataUrl", () => {
  it("builds a data URL with the requested content type", () => {
    expect(buildDownloadDataUrl("application/json", "{}")).toBe(
      "data:application/json;charset=utf-8,%7B%7D",
    );
  });

  it("encodes non-ASCII characters", () => {
    expect(buildDownloadDataUrl("text/markdown", "你好")).toBe(
      "data:text/markdown;charset=utf-8,%E4%BD%A0%E5%A5%BD",
    );
  });

  it("preserves ASCII content unchanged", () => {
    expect(buildDownloadDataUrl("text/csv", "a,b\n1,2")).toBe(
      "data:text/csv;charset=utf-8,a%2Cb%0A1%2C2",
    );
  });
});
