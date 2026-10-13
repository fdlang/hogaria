import { describe, expect, it } from "vitest";
import { isMaintenanceModeEnabled } from "./maintenance-config";

describe("isMaintenanceModeEnabled", () => {
  it("enables maintenance only when explicitly configured", () => {
    expect(isMaintenanceModeEnabled("true")).toBe(true);
    expect(isMaintenanceModeEnabled(" TRUE ")).toBe(true);
  });

  it("keeps the application available by default", () => {
    expect(isMaintenanceModeEnabled(undefined)).toBe(false);
    expect(isMaintenanceModeEnabled("")).toBe(false);
    expect(isMaintenanceModeEnabled("false")).toBe(false);
    expect(isMaintenanceModeEnabled("1")).toBe(false);
  });
});
