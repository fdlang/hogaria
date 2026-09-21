import { describe, expect, it } from "vitest";
import { optionalDateInput, pageIndex, positiveId, validDate } from "./requestValidation.js";

describe("HTTP request validation", () => {
  it("rejects malformed identifiers before they reach persistence", () => {
    expect(() => positiveId("not-a-number")).toThrow("Identificador no válido");
    expect(() => positiveId(0)).toThrow("Identificador no válido");
    expect(positiveId("12")).toBe(12);
  });

  it("accepts only non-negative integer pages", () => {
    expect(pageIndex(undefined)).toBe(0);
    expect(pageIndex("2")).toBe(2);
    expect(() => pageIndex("1.5")).toThrow("Página no válida");
  });

  it("rejects invalid dates with their field", () => {
    expect(() => validDate("not-a-date", "from")).toThrow("Fecha no válida");
    expect(validDate("2026-09-21", "from")?.toISOString()).toContain("2026-09-21");
  });

  it("does not coerce numbers or objects into dates", () => {
    expect(() => optionalDateInput(0, "fechaVisita")).toThrow("Fecha no válida");
    expect(() => optionalDateInput({}, "fechaVisita")).toThrow("Fecha no válida");
    expect(optionalDateInput(null, "fechaVisita")).toBeNull();
  });
});
