import { describe, expect, it } from "vitest";

import { isGoogleAuthError } from "../../src/google/oauth.js";

describe("isGoogleAuthError", () => {
  it("detects 401 and 403 status codes", () => {
    expect(isGoogleAuthError({ code: 401 })).toBe(true);
    expect(isGoogleAuthError({ status: 403 })).toBe(true);
  });

  it("detects invalid_grant in message", () => {
    expect(isGoogleAuthError({ message: "invalid_grant" })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isGoogleAuthError({ code: 500, message: "server error" })).toBe(false);
    expect(isGoogleAuthError(null)).toBe(false);
  });
});
