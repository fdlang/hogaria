import { describe, expect, it } from "vitest";
import { isValidAccountPassword, isWithinAccountPasswordByteLimit } from "./credentials.js";

describe("isValidAccountPassword", () => {
  it.each(["short1", "abcdefghijkl", "123456789012"])("rejects %s", value => {
    expect(isValidAccountPassword(value)).toBe(false);
  });
  it("accepts 12 to 72 bytes containing letters and numbers", () => {
    expect(isValidAccountPassword("ClaveSegura2026")).toBe(true);
  });
  it("applies the bcrypt byte limit independently from the creation policy", () => {
    expect(isWithinAccountPasswordByteLimit("legacy-short")).toBe(true);
    expect(isWithinAccountPasswordByteLimit("ñ".repeat(37))).toBe(false);
  });
});
