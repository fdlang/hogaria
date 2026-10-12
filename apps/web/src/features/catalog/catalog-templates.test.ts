import { describe, expect, it } from "vitest";
import { ESTIMATE_TEMPLATES } from "@reformapro/domain";
import { expectedTemplateItems, resolveCatalogTemplate, type TemplateMeasurements } from "./CatalogPicker";

const measurements = (values: Partial<TemplateMeasurements> = {}): TemplateMeasurements => ({
  floorArea: 0,
  wallArea: 0,
  baseCabinetMetres: 0,
  wallCabinetMetres: 0,
  worktopMetres: 0,
  wardrobeMetres: 0,
  ...values,
});

describe("estimate catalog templates", () => {
  it("uses measurements and silently omits unavailable archived references", () => {
    const catalog = [{ categoria: "Revestimientos", items: [
      { ref: "REV-001", descripcion: "Alicatado", unidad: "m²", precio: 64, iva: 21 },
      { ref: "REV-003", descripcion: "Solado", unidad: "m²", precio: 76, iva: 21 },
    ] }];
    const result = resolveCatalogTemplate(ESTIMATE_TEMPLATES[0]!, catalog, measurements({ floorArea: 5, wallArea: 22 }));
    expect(result.map(item => [item.item.ref, item.cantidad])).toEqual([["REV-001", 22], ["REV-003", 5]]);
  });

  it("assigns each kitchen measurement to its own item and omits optional upper cabinets", () => {
    const kitchen = ESTIMATE_TEMPLATES.find(template => template.id === "kitchen")!;
    const catalog = [{ categoria: "Cocina", items: [
      { ref: "COC-001", descripcion: "Muebles bajos", unidad: "ml", precio: 700, iva: 21 },
      { ref: "COC-002", descripcion: "Muebles altos", unidad: "ml", precio: 650, iva: 21 },
      { ref: "COC-003", descripcion: "Encimera", unidad: "ml", precio: 430, iva: 21 },
    ] }];
    const values = measurements({ floorArea: 8.5, baseCabinetMetres: 4.2, worktopMetres: 3.8 });

    expect(resolveCatalogTemplate(kitchen, catalog, values).map(item => [item.item.ref, item.cantidad]))
      .toEqual([["COC-001", 4.2], ["COC-003", 3.8]]);
    expect(expectedTemplateItems(kitchen, values).some(item => item.reference === "COC-002")).toBe(false);
  });
});
