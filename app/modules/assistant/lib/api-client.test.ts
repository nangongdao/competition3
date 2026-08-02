import { describe, expect, it } from "vitest";

import { buildClientTokenHeaders, CLIENT_TOKEN_HEADER } from "./api-client";

describe("api client token header", () => {
  it("returns no headers when the token is undefined", () => {
    expect(buildClientTokenHeaders(undefined)).toEqual({});
  });

  it("returns no headers when the token is empty", () => {
    expect(buildClientTokenHeaders("  ")).toEqual({});
  });

  it("attaches the token header when present", () => {
    expect(buildClientTokenHeaders("secret-token")).toEqual({
      [CLIENT_TOKEN_HEADER]: "secret-token",
    });
  });
});
