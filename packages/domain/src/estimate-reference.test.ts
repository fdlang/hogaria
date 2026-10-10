import { describe, expect, it } from "vitest";
import { createEstimateReference, ESTIMATE_REFERENCE_POLICY } from "./estimate-reference.js";

describe("estimate references", () => {
  it("creates a compact, readable reference with 64 bits of entropy", () => {
    const reference = createEstimateReference(2026, "e16140b8-cc28-44fe-a2b7-4ce8da397f8c");

    expect(reference).toMatch(/^HOG-2026-[0-9A-Z]{13}$/);
    expect(reference).toHaveLength(22);
    expect(ESTIMATE_REFERENCE_POLICY.nextReview).toBe("2027-01-10");
  });

  it("rejects malformed entropy instead of producing a weak reference", () => {
    expect(() => createEstimateReference(2026, "short")).toThrow("Entropía");
  });
});
