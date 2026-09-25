import { describe, expect, it } from "vitest";
import { ABUSE_LIMITS, RATE_LIMIT_POLICY } from "./security-policy.js";

describe("anti-abuse policy", () => {
  it("keeps every limit centralized and versioned", () => {
    expect(RATE_LIMIT_POLICY.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(RATE_LIMIT_POLICY.retentionMs).toBeGreaterThanOrEqual(
      Math.max(...Object.values(ABUSE_LIMITS).map(rule => rule.windowMs)),
    );
    for (const rule of Object.values(ABUSE_LIMITS)) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThan(0);
    }
  });
});
