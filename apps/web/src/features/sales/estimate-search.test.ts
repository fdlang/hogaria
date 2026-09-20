import { describe, expect, it } from "vitest";
import { estimateStatus, filterEstimates } from "./estimate-search";
import type { EstimateDTO } from "./api/sales.api";
const items = [
  {
    id: 1,
    numero: "HOG-2026-001",
    titulo: "Reforma de baño",
    estado: "enviado",
    propuesta: { referencia: "Pinto" },
  },
  {
    id: 2,
    numero: "HOG-2026-002",
    titulo: "Cocina",
    estado: "firmado",
    propuesta: null,
  },
] as EstimateDTO[];
describe("estimate search", () => {
  it("ignores accents, case and whitespace and combines terms", () =>
    expect(filterEstimates(items, "  BANO  PINTO ", "")).toEqual([items[0]]));
  it("matches numbers and combines status with search", () => {
    expect(filterEstimates(items, "002", "firmado")).toEqual([items[1]]);
    expect(filterEstimates(items, "002", "enviado")).toEqual([]);
  });
  it("preserves order and original data when filters are cleared", () => {
    expect(filterEstimates(items, "", "")).toEqual(items);
    expect(items).toHaveLength(2);
  });
  it("labels an internal revision as a non-actionable client update", () => {
    expect(estimateStatus("actualizando")).toBe("Actualización en preparación");
  });
});
