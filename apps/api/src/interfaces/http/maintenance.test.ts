import { describe, expect, it } from "vitest";
import { isApiMaintenanceModeEnabled, maintenanceResponse } from "./maintenance.js";

describe("API maintenance mode", () => {
  it("is enabled only by the explicit true value", () => {
    expect(isApiMaintenanceModeEnabled("true")).toBe(true);
    expect(isApiMaintenanceModeEnabled("false")).toBe(false);
    expect(isApiMaintenanceModeEnabled(undefined)).toBe(false);
  });

  it("returns a retryable non-cacheable service response", () => {
    expect(maintenanceResponse).toMatchObject({ status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  });
});
