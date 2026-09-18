import { ApiClient } from "@/shared/lib/api-client";

export type OpportunityDTO = { id: number; clienteId: number | null; nombre: string; email: string | null; telefono: string | null; direccion: string; tipo: string; descripcion: string; estado: string; fechaVisita: string | null; notasInternas: string; createdAt: string; updatedAt: string };
export type EstimateLineDTO = { id: string; categoria: string; descripcion: string; cantidad: number; unidad: string; precioVentaUnitario: number; costeUnitario: number | null; descuento: number; iva: number; notaCliente?: string; notaInterna?: string };
export type EstimateDraftDTO = { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; notasInternas: string; partidas: EstimateLineDTO[] };
export type PublicProposalDTO = EstimateDraftDTO & { totalSinIva: number; totalIva: number; totalConIva: number; enviadoAt: string | null; firmadoAt: string | null; hash: string | null };
export type EstimateDTO = { id: number; numero: string; titulo: string; estado: string; versionActual: number; propuesta: PublicProposalDTO | null; createdAt: string; updatedAt: string };

export class SalesApi {
  constructor(private readonly http: ApiClient) {}
  opportunities() { return this.http.get<OpportunityDTO[]>("/opportunities"); }
  createOpportunity(input: Omit<OpportunityDTO, "id" | "createdAt" | "updatedAt">) { return this.http.post<OpportunityDTO>("/opportunities", input); }
  estimates() { return this.http.get<EstimateDTO[]>("/estimates"); }
  createEstimate(oportunidadId: number, borrador: EstimateDraftDTO) { return this.http.post<EstimateDTO>("/estimates", { oportunidadId, borrador }); }
  sendEstimate(id: number) { return this.http.post<EstimateDTO>(`/estimates/${id}/send`); }
  signEstimate(id: number, input: { password: string; canvasSignature: string; consentimiento: string }) { return this.http.post<{ estimate: EstimateDTO; hash: string; fechaFirma: string }>(`/estimates/${id}/sign`, input); }
  rejectEstimate(id: number, motivo: string) { return this.http.post<EstimateDTO>(`/estimates/${id}/reject`, { motivo }); }
  convertToProject(id: number) { return this.http.post<{ id: number; estimateId: number }>(`/estimates/${id}/accept`); }
}
