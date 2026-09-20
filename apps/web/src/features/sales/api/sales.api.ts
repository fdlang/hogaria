import { ApiClient } from "@/shared/lib/api-client";

export type OpportunityDTO = { id: number; clienteId: number | null; nombre: string; email: string | null; telefono: string | null; direccion: string; tipo: string; descripcion: string; estado: string; fechaVisita: string | null; notasInternas: string; createdAt: string; updatedAt: string };
export type EstimateLineDTO = { id: string; categoria: string; descripcion: string; cantidad: number; unidad: string; precioVentaUnitario: number; costeUnitario: number | null; descuento: number; iva: number; notaCliente?: string; notaInterna?: string };
export type EstimateDraftDTO = { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; notasInternas: string; partidas: EstimateLineDTO[] };
export type PublicEstimateLineDTO = Pick<EstimateLineDTO, "id" | "categoria" | "descripcion" | "cantidad" | "unidad" | "precioVentaUnitario" | "descuento" | "iva" | "notaCliente">;
export type PublicProposalDTO = { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; partidas: PublicEstimateLineDTO[]; totalSinIva: number; totalIva: number; totalConIva: number; enviadoAt: string | null; expiresAt: string | null; firmadoAt: string | null; hash: string | null };
export type EstimateDTO = { id: number; numero: string; clienteNombre: string; titulo: string; estado: string; versionActual: number; motivoRechazo: string | null; propuesta: PublicProposalDTO | null; createdAt: string; updatedAt: string };
export type CatalogItemDTO = { id: number; reference: string; category: string; description: string; unit: string; salePrice: number; vatRate: number; active: boolean; updatedAt: string };
export type AdminEstimateDTO = { id: number; oportunidadId: number; estado: string; borrador: EstimateDraftDTO };
export type ChangeOrderDTO = { id: number; numero: string; estado: string; payload?: EstimateDraftDTO; propuesta?: Pick<PublicProposalDTO, "titulo" | "partidas" | "condicionesPago"> };

export class SalesApi {
  constructor(private readonly http: ApiClient) {}
  opportunities() { return this.http.get<OpportunityDTO[]>("/opportunities"); }
  updateOpportunity(id: number, input: Partial<OpportunityDTO>) { return this.http.patch<OpportunityDTO>(`/opportunities/${id}`, input); }
  catalog() { return this.http.get<CatalogItemDTO[]>("/catalog"); }
  adminCatalog() { return this.http.get<CatalogItemDTO[]>("/catalog?includeInactive=true"); }
  createCatalogItem(input: Omit<CatalogItemDTO, "id" | "active" | "updatedAt">) { return this.http.post<CatalogItemDTO>("/catalog", input); }
  updateCatalogItem(id: number, input: Partial<Omit<CatalogItemDTO, "id" | "updatedAt">>) { return this.http.patch<CatalogItemDTO>(`/catalog/${id}`, input); }
  archiveCatalogItem(id: number) { return this.http.delete<CatalogItemDTO>(`/catalog/${id}`); }
  createOpportunity(input: Omit<OpportunityDTO, "id" | "createdAt" | "updatedAt">) { return this.http.post<OpportunityDTO>("/opportunities", input); }
  estimates(page = 0, search = "", status = "") { return this.http.get<EstimateDTO[]>(`/estimates?page=${page}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`); }
  history(id: number) { return this.http.get<EstimateDTO[]>(`/estimates/${id}/history`); }
  draft(id: number) { return this.http.get<AdminEstimateDTO>(`/estimates/${id}/draft`); }
  updateEstimate(id: number, borrador: EstimateDraftDTO) { return this.http.patch<EstimateDTO>(`/estimates/${id}`, { borrador }); }
  reviseEstimate(id: number) { return this.http.post<AdminEstimateDTO>(`/estimates/${id}/revise`); }
  downloadPdf(id:number,version:number) { return this.http.download(`/estimates/${id}/pdf?version=${version}`); }
  createEstimate(oportunidadId: number, borrador: EstimateDraftDTO) { return this.http.post<EstimateDTO>("/estimates", { oportunidadId, borrador }); }
  sendEstimate(id: number) { return this.http.post<EstimateDTO>(`/estimates/${id}/send`); }
  signEstimate(id: number, input: { password: string; canvasSignature: string; consentimiento: string; version: number }) { return this.http.post<{ estimate: EstimateDTO; hash: string; fechaFirma: string }>(`/estimates/${id}/sign`, input); }
  rejectEstimate(id: number, motivo: string) { return this.http.post<EstimateDTO>(`/estimates/${id}/reject`, { motivo }); }
  convertToProject(id: number) { return this.http.post<{ id: number; estimateId: number }>(`/estimates/${id}/accept`); }
}
