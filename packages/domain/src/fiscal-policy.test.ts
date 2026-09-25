import { describe, expect, it } from "vitest";
import { fiscalPolicyAt } from "./fiscal-policy.js";

describe("effective fiscal parameters", () => {
  it("selects parameters by document date instead of rewriting history", () => {
    expect(fiscalPolicyAt(new Date("2026-09-26T12:00:00Z"))).toMatchObject({ defaultVatRate: 21, selectableVatRates: [21, 10, 4, 0] });
    expect(() => fiscalPolicyAt(new Date("2020-01-01T00:00:00Z"))).toThrow("fiscales");
  });
});
