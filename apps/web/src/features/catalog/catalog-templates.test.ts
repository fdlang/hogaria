import { describe, expect, it } from "vitest";
import { ESTIMATE_TEMPLATES } from "@reformapro/domain";
import { resolveCatalogTemplate } from "./CatalogPicker";

describe("estimate catalog templates", () => {
  it("uses measurements and silently omits unavailable archived references", () => {
    const catalog = [{ categoria: "Revestimientos", items: [
      { ref: "REV-001", descripcion: "Alicatado", unidad: "m²", precio: 64, iva: 21 },
      { ref: "REV-003", descripcion: "Solado", unidad: "m²", precio: 76, iva: 21 },
    ] }];
    const result = resolveCatalogTemplate(ESTIMATE_TEMPLATES[0]!, catalog, { floorArea: 5, wallArea: 22, linearMetres: 0 });
    expect(result.map(item => [item.item.ref, item.cantidad])).toEqual([["REV-001", 22], ["REV-003", 5]]);
  });
});
