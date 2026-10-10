import { describe, expect, it } from "vitest";
import { blankOpportunity, mergeCatalogLines, opportunityForSelection } from "./sales-pipeline.utils";

describe("opportunityForSelection", () => {
  it("clears values when the administrator selects create new", () => {
    const existing = [{ id: 7, clienteId: 3, nombre: "Anterior", direccion: "Madrid", tipo: "Baño", descripcion: "Detalle" }];
    expect(opportunityForSelection("", existing as never)).toEqual(blankOpportunity());
  });
});

describe("mergeCatalogLines", () => {
  const catalogLine = {
    id: "new", categoria: "Fontanería", descripcion: "Instalación de lavabo", cantidad: 1,
    unidad: "ud", precioVentaUnitario: 180, costeUnitario: 100, descuento: 0, iva: 21,
  };

  it("combines an identical catalog line instead of duplicating it", () => {
    const current = [{ ...catalogLine, id: "existing", cantidad: 2 }];
    expect(mergeCatalogLines(current, [catalogLine])).toEqual({
      lines: [{ ...catalogLine, id: "existing", cantidad: 3 }],
      mergedCount: 1,
    });
  });

  it("keeps a separately edited line as a distinct item", () => {
    const current = [{ ...catalogLine, id: "existing", precioVentaUnitario: 175 }];
    expect(mergeCatalogLines(current, [catalogLine])).toEqual({
      lines: [current[0], catalogLine],
      mergedCount: 0,
    });
  });
});
