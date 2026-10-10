import { describe, expect, it } from "vitest";
import { calculateCatalogPrice, catalogActivationIssues, isValidCatalogCostBreakdown } from "./catalog-pricing.js";

describe("catalog pricing", () => {
  it("keeps evidence costs separate until commercial rates are known", () => {
    expect(calculateCatalogPrice({ laborCost: 75.76, materialCost: 2.55, auxiliaryCost: 0, overheadPercent: null, targetMarginPercent: null }))
      .toEqual({ directCost: 78.31, costWithOverhead: null, suggestedSalePrice: null });
  });

  it("calculates overhead and target gross margin without binary rounding drift", () => {
    expect(calculateCatalogPrice({ laborCost: 75.76, materialCost: 2.55, auxiliaryCost: 0, overheadPercent: 13, targetMarginPercent: 20 }))
      .toEqual({ directCost: 78.31, costWithOverhead: 88.49, suggestedSalePrice: 110.61 });
  });

  it("rejects impossible costs and a one hundred percent target margin", () => {
    expect(isValidCatalogCostBreakdown({ laborCost: -1, materialCost: null, auxiliaryCost: null, overheadPercent: 0, targetMarginPercent: 0 })).toBe(false);
    expect(() => calculateCatalogPrice({ laborCost: 1, materialCost: 0, auxiliaryCost: 0, overheadPercent: 0, targetMarginPercent: 100 })).toThrow();
  });

  it("only validates traceable positive prices inside their validity window", () => {
    const candidate = {
      salePrice: 110.61,
      costBreakdown: { laborCost: 75.76, materialCost: 2.55, auxiliaryCost: 0, overheadPercent: 13, targetMarginPercent: 20 },
      evidence: { sourceName: "CYPE", sourceUrl: null, priceDate: "2026-10-10", validFrom: "2026-10-10", validUntil: "2027-01-10" },
    };
    expect(catalogActivationIssues(candidate, "2026-10-10")).toEqual([]);
    expect(catalogActivationIssues({ ...candidate, salePrice: 0 }, "2026-10-10")).toContain("sale_price");
    expect(catalogActivationIssues({ ...candidate, evidence: { ...candidate.evidence, validUntil: "2026-10-09" } }, "2026-10-10")).toContain("expired");
  });
});
