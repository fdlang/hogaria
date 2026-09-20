import type { OpportunityDTO } from "./api/sales.api";

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
