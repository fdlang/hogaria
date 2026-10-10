import { ApiClient } from "@/shared/lib/api-client";
import { ApiContractError, isRecord } from "@/shared/lib/contracts";

export type OpportunityDTO = { id: number; clienteId: number | null; nombre: string; email: string | null; telefono: string | null; direccion: string; tipo: string; descripcion: string; estado: string; fechaVisita: string | null; notasInternas: string; createdAt: string; updatedAt: string };
export type OpportunityPageDTO = { items: OpportunityDTO[]; total: number; page: number; limit: number; pages: number };
export type EstimateLineDTO = { id: string; categoria: string; descripcion: string; cantidad: number; unidad: string; precioVentaUnitario: number; costeUnitario: number | null; descuento: number; iva: number; notaCliente?: string; notaInterna?: string };
export type EstimateDraftDTO = { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; notasInternas: string; partidas: EstimateLineDTO[] };
export type PublicEstimateLineDTO = Pick<EstimateLineDTO, "id" | "categoria" | "descripcion" | "cantidad" | "unidad" | "precioVentaUnitario" | "descuento" | "iva" | "notaCliente">;
export type PublicProposalDTO = { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; partidas: PublicEstimateLineDTO[]; totalSinIva: number; totalIva: number; totalConIva: number; enviadoAt: string | null; expiresAt: string | null; firmadoAt: string | null; hash: string | null };
export type EstimateDTO = { id: number; numero: string; clienteNombre: string; titulo: string; estado: string; versionActual: number; motivoRechazo: string | null; propuesta: PublicProposalDTO | null; createdAt: string; updatedAt: string };
export type CatalogItemDTO = { id: number; reference: string; category: string; description: string; unit: string; salePrice: number; vatRate: number; active: boolean; updatedAt: string };
export type AdminEstimateDTO = { id: number; oportunidadId: number; estado: string; borrador: EstimateDraftDTO };
export type ChangeOrderDTO = { id: number; numero: string; estado: string; payload?: EstimateDraftDTO; propuesta?: Pick<PublicProposalDTO, "titulo" | "partidas" | "condicionesPago"> };

export const parseEstimateList = (value: unknown): EstimateDTO[] => {
  if (!Array.isArray(value) || value.some(item =>
    !isRecord(item) || !Number.isSafeInteger(item.id) || typeof item.numero !== "string" ||
    typeof item.clienteNombre !== "string" || typeof item.titulo !== "string" ||
    typeof item.estado !== "string" || !Number.isSafeInteger(item.versionActual) ||
    !(item.motivoRechazo === null || typeof item.motivoRechazo === "string") ||
    !(item.propuesta === null || isRecord(item.propuesta)) ||
    typeof item.createdAt !== "string" || typeof item.updatedAt !== "string"
  )) throw new ApiContractError("los presupuestos");
  return value as EstimateDTO[];
};

const ensurePdf = (blob: Blob): Blob => {
  if (blob.size === 0 || !blob.type.toLowerCase().startsWith("application/pdf")) {
    throw new ApiContractError("el PDF del presupuesto");
  }
  return blob;
};

export class SalesApi {
  private readonly pdfCache = new Map<string, Blob>();
  private readonly pendingPdfs = new Map<string, Promise<Blob>>();

  constructor(private readonly http: ApiClient) {}
  opportunities() { return this.http.get<OpportunityDTO[]>("/opportunities"); }
  opportunity(id: number) { return this.http.get<OpportunityDTO>(`/opportunities/${id}`); }
  opportunityPage(query: { page: number; limit?: number; search?: string; status?: string }) {
    const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit ?? 20), search: query.search ?? "", status: query.status ?? "" });
    return this.http.get<OpportunityPageDTO>(`/opportunities?${params.toString()}`);
  }
  updateOpportunity(id: number, input: Partial<OpportunityDTO>, expectedUpdatedAt: string) { return this.http.patch<OpportunityDTO>(`/opportunities/${id}`, { ...input, expectedUpdatedAt }); }
  catalog() { return this.http.get<CatalogItemDTO[]>("/catalog"); }
  adminCatalog() { return this.http.get<CatalogItemDTO[]>("/catalog?includeInactive=true"); }
  createCatalogItem(input: Omit<CatalogItemDTO, "id" | "active" | "updatedAt">) { return this.http.post<CatalogItemDTO>("/catalog", input); }
  updateCatalogItem(id: number, input: Partial<Omit<CatalogItemDTO, "id" | "updatedAt">>) { return this.http.patch<CatalogItemDTO>(`/catalog/${id}`, input); }
  archiveCatalogItem(id: number) { return this.http.delete<CatalogItemDTO>(`/catalog/${id}`); }
  createOpportunity(input: Omit<OpportunityDTO, "id" | "createdAt" | "updatedAt">) { return this.http.post<OpportunityDTO>("/opportunities", input); }
  async estimates(page = 0, search = "", status = "") { return parseEstimateList(await this.http.get<unknown>(`/estimates?page=${page}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`)); }
  async estimatesPage(page = 0, search = "", status = "") {
    const result = parseEstimateList(await this.http.get<unknown>(`/estimates?page=${page}&limit=21&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`));
    return { items: result.slice(0, 20), hasNext: result.length > 20 };
  }
  async history(id: number) { return parseEstimateList(await this.http.get<unknown>(`/estimates/${id}/history`)); }
  draft(id: number) { return this.http.get<AdminEstimateDTO>(`/estimates/${id}/draft`); }
  updateEstimate(id: number, borrador: EstimateDraftDTO) { return this.http.patch<EstimateDTO>(`/estimates/${id}`, { borrador }); }
  reviseEstimate(id: number) { return this.http.post<AdminEstimateDTO>(`/estimates/${id}/revise`); }
  downloadPdf(
    id: number,
    version: number,
    revision = "",
    options: { reuse?: boolean } = {},
  ) {
    const key = `${id}:${version}:${revision}`;
    if (options.reuse === false) {
      const pending = this.pendingPdfs.get(`fresh:${key}`);
      if (pending) return pending;
      const request = this.http.download(`/estimates/${id}/pdf?version=${version}`)
        .then(ensurePdf)
        .finally(() => this.pendingPdfs.delete(`fresh:${key}`));
      this.pendingPdfs.set(`fresh:${key}`, request);
      return request;
    }
    const cached = this.pdfCache.get(key);
    if (cached) {
      this.pdfCache.delete(key);
      this.pdfCache.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pendingPdfs.get(key);
    if (pending) return pending;

    const request = this.http.download(`/estimates/${id}/pdf?version=${version}`)
      .then(ensurePdf)
      .then(blob => {
        this.pdfCache.set(key, blob);
        while (this.pdfCache.size > 8) {
          const oldest = this.pdfCache.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          this.pdfCache.delete(oldest);
        }
        return blob;
      })
      .finally(() => this.pendingPdfs.delete(key));
    this.pendingPdfs.set(key, request);
    return request;
  }
  createEstimate(oportunidadId: number, borrador: EstimateDraftDTO) { return this.http.post<EstimateDTO>("/estimates", { oportunidadId, borrador }); }
  sendEstimate(id: number) { return this.http.post<EstimateDTO>(`/estimates/${id}/send`); }
  signEstimate(id: number, input: { password: string; canvasSignature: string; consentimiento: string; version: number }) { return this.http.post<{ estimate: EstimateDTO; hash: string; fechaFirma: string }>(`/estimates/${id}/sign`, input); }
  rejectEstimate(id: number, motivo: string) { return this.http.post<EstimateDTO>(`/estimates/${id}/reject`, { motivo }); }
  convertToProject(id: number) { return this.http.post<{ id: number; estimateId: number }>(`/estimates/${id}/accept`); }
}
