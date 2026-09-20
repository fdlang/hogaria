import { describe, expect, it } from "vitest";
import { blankOpportunity, opportunityForSelection } from "./sales-pipeline.utils";

describe("opportunityForSelection", () => {
  it("clears values when the administrator selects create new", () => {
    const existing = [{ id: 7, clienteId: 3, nombre: "Anterior", direccion: "Madrid", tipo: "Baño", descripcion: "Detalle" }];
    expect(opportunityForSelection("", existing as never)).toEqual(blankOpportunity());
  });
});
