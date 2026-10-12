import { describe, expect, it } from "vitest";
import { duplicateEstimateDraft } from "./estimate-duplication.js";

describe("duplicateEstimateDraft", () => {
  it("copies commercial content but renews title, reference and line identifiers", () => {
    let sequence = 0;
    const source = {
      titulo: "Reforma de cocina",
      referencia: "CLIENTE-2026",
      validezDias: 30,
      condicionesPago: "Observaciones",
      garantia: "",
      notasCliente: "",
      notasInternas: "Nota interna",
      partidas: [{ id: "original", categoria: "Cocina", descripcion: "Mobiliario", cantidad: 1, unidad: "global", precioVentaUnitario: 100, costeUnitario: 50, descuento: 0, iva: 21 }],
    };

    const copy = duplicateEstimateDraft(source, () => `copy-${++sequence}`);

    expect(copy).toMatchObject({ titulo: "Copia de Reforma de cocina", condicionesPago: "Observaciones", notasInternas: "Nota interna" });
    expect(copy).not.toHaveProperty("referencia");
    expect(copy.partidas[0]).toMatchObject({ id: "copy-1", descripcion: "Mobiliario", precioVentaUnitario: 100 });
    expect(source.partidas[0]?.id).toBe("original");
  });
});
