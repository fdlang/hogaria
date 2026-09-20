import { describe, expect, it } from "vitest";
import { BUSINESS_RULES } from "./index.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("business rule governance catalog", () => {
  it("keeps identifiers unique and every rule traceable", () => {
    expect(new Set(BUSINESS_RULES.map(rule => rule.id)).size).toBe(BUSINESS_RULES.length);
    for (const rule of BUSINESS_RULES) {
      expect(rule.description.trim()).not.toBe("");
      expect(rule.implementation.length).toBeGreaterThan(0);
      expect(rule.tests.length).toBeGreaterThan(0);
      expect(rule.metrics.length).toBeGreaterThan(0);
      expect(Date.parse(rule.nextReview)).not.toBeNaN();
      expect(Date.parse(rule.nextReview)).toBeGreaterThanOrEqual(Date.parse(rule.validFrom));
      for (const path of [...rule.implementation, ...rule.tests]) {
        expect(existsSync(resolve(process.cwd(), "../..", path)), `${rule.id}: ${path}`).toBe(true);
      }
    }
  });
});
