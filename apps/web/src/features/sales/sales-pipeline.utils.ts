import type { EstimateLineDTO, OpportunityDTO } from "./api/sales.api";

export type OpportunityForm = {
  clienteId: string;
  nombre: string;
  direccion: string;
  tipo: string;
  descripcion: string;
};

export const blankOpportunity = (): OpportunityForm => ({
  clienteId: "",
  nombre: "",
  direccion: "",
  tipo: "Reforma integral",
  descripcion: "",
});

export function opportunityForSelection(id: string, opportunities: OpportunityDTO[]): OpportunityForm {
  const item = opportunities.find(value => value.id === Number(id));
  return item
    ? { clienteId: item.clienteId == null ? "" : String(item.clienteId), nombre: item.nombre, direccion: item.direccion, tipo: item.tipo, descripcion: item.descripcion }
    : blankOpportunity();
}

const sameCatalogOrigin = (left: EstimateLineDTO, right: EstimateLineDTO) => {
  if (left.catalogItemId !== undefined || right.catalogItemId !== undefined) {
    return left.catalogItemId === right.catalogItemId && left.catalogPriceVersion === right.catalogPriceVersion && left.precioVentaUnitario === right.precioVentaUnitario && left.descuento === right.descuento;
  }
  return left.categoria === right.categoria &&
  left.descripcion === right.descripcion &&
  left.unidad === right.unidad &&
  left.precioVentaUnitario === right.precioVentaUnitario &&
  left.costeUnitario === right.costeUnitario &&
  left.descuento === right.descuento &&
  left.iva === right.iva &&
  (left.notaCliente ?? "") === (right.notaCliente ?? "") &&
  (left.notaInterna ?? "") === (right.notaInterna ?? "");
};

export function mergeCatalogLines(current: EstimateLineDTO[], additions: EstimateLineDTO[]) {
  const lines = [...current];
  let mergedCount = 0;
  additions.forEach(addition => {
    const index = lines.findIndex(line => sameCatalogOrigin(line, addition));
    if (index < 0) {
      lines.push(addition);
      return;
    }
    const existing = lines[index]!;
    lines[index] = { ...existing, cantidad: existing.cantidad + addition.cantidad };
    mergedCount += 1;
  });
  return { lines, mergedCount };
}
