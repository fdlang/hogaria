import { ApiClient } from "@/shared/lib/api-client";
import { ApiContractError, isRecord } from "@/shared/lib/contracts";

export type OpportunityDTO = { id: number; clienteId: number | null; nombre: string; email: string | null; telefono: string | null; direccion: string; tipo: string; descripcion: string; estado: string; fechaVisita: string | null; notasInternas: string; createdAt: string; updatedAt: string };
export type OpportunityPageDTO = { items: OpportunityDTO[]; total: number; page: number; limit: number; pages: number };
export type EstimateLineDTO = { id: string; categoria: string; descripcion: string; cantidad: number; unidad: string; precioVentaUnitario: number; costeUnitario: number | null; descuento: number; iva: number; notaCliente?: string; notaInterna?: string; pendingConfirmation?: boolean; catalogItemId?: number; catalogReference?: string; catalogPriceVersion?: number; catalogBasePrice?: number; priceOverrideReason?: string };
export type EstimateDraftDTO = { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; notasInternas: string; partidas: EstimateLineDTO[] };
export type PublicEstimateLineDTO = Pick<EstimateLineDTO, "id" | "categoria" | "descripcion" | "cantidad" | "unidad" | "precioVentaUnitario" | "descuento" | "iva" | "notaCliente" | "pendingConfirmation">;
export type PublicProposalDTO = { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; partidas: PublicEstimateLineDTO[]; totalSinIva: number; totalIva: number; totalConIva: number; enviadoAt: string | null; expiresAt: string | null; firmadoAt: string | null; hash: string | null };
export type EstimateDTO = { id: number; numero: string; clienteNombre: string; titulo: string; estado: string; versionActual: number; motivoRechazo: string | null; motivoAnulacion: string | null; propuesta: PublicProposalDTO | null; createdAt: string; updatedAt: string };
export type CatalogItemDTO = {
  id: number; reference: string; category: string; description: string; unit: "m²" | "ml" | "ud" | "h" | "global";
  salePrice: number; vatRate: number; active: boolean; itemType: "simple" | "composite";
  reviewStatus: "pending_review" | "verified" | "archived";
  replacementReference: string | null; reviewNote: string | null;
  costBreakdown: { laborCost: number | null; materialCost: number | null; auxiliaryCost: number | null; overheadPercent: number | null; targetMarginPercent: number | null };
  costComposition: {
    labor: { trade: string; performanceHoursPerUnit: number; hourlyCost: number }[];
    materials: { description: string; unit: string; quantityPerUnit: number; unitCost: number }[];
    auxiliaries: { description: string; amountPerUnit: number }[];
  };
  pricingMode: "legacy_total" | "decomposed"; tariffZone: "Madrid"; priceVersion: number;
  evidence: { sourceName: string | null; sourceUrl: string | null; priceDate: string | null; validFrom: string | null; validUntil: string | null };
  searchTerms: string[]; updatedAt: string;
};
export type CatalogPickerItemDTO = Pick<CatalogItemDTO, "id" | "reference" | "category" | "description" | "unit" | "salePrice" | "vatRate" | "priceVersion"> & { unitCost: number | null };
export type CatalogPickerPageDTO = { items: CatalogPickerItemDTO[]; total: number; page: number; limit: number; pages: number };
  export type CatalogWriteDTO = Pick<CatalogItemDTO, "reference" | "category" | "description" | "unit" | "salePrice" | "vatRate"> & Partial<Pick<CatalogItemDTO, "itemType" | "costBreakdown" | "costComposition" | "pricingMode" | "tariffZone" | "evidence" | "searchTerms" | "reviewStatus" | "replacementReference" | "reviewNote">> & { expectedUpdatedAt?: string };
export type AdminEstimateDTO = { id: number; oportunidadId: number; estado: string; borrador: EstimateDraftDTO; updatedAt: string };
export type ChangeOrderDTO = { id: number; revision: number; numero: string; estado: string; payload?: EstimateDraftDTO; propuesta?: Pick<PublicProposalDTO, "titulo" | "partidas" | "condicionesPago"> };

export const parseEstimateList = (value: unknown): EstimateDTO[] => {
  if (!Array.isArray(value) || value.some(item =>
    !isRecord(item) || !Number.isSafeInteger(item.id) || typeof item.numero !== "string" ||
    typeof item.clienteNombre !== "string" || typeof item.titulo !== "string" ||
    typeof item.estado !== "string" || !Number.isSafeInteger(item.versionActual) ||
    !(item.motivoRechazo === null || typeof item.motivoRechazo === "string") ||
    !(item.motivoAnulacion === undefined || item.motivoAnulacion === null || typeof item.motivoAnulacion === "string") ||
    !(item.propuesta === null || isRecord(item.propuesta)) ||
    typeof item.createdAt !== "string" || typeof item.updatedAt !== "string"
  )) throw new ApiContractError("los presupuestos");
  return value.map(item => ({ ...item, motivoAnulacion: item.motivoAnulacion ?? null })) as EstimateDTO[];
};

const isCatalogItem = (item: unknown): item is CatalogItemDTO => isRecord(item) &&
  Number.isSafeInteger(item.id) && typeof item.reference === "string" && typeof item.category === "string" &&
  typeof item.description === "string" && ["m²", "ml", "ud", "h", "global"].includes(String(item.unit)) &&
  typeof item.salePrice === "number" && Number.isFinite(item.salePrice) && typeof item.vatRate === "number" &&
  typeof item.active === "boolean" && ["simple", "composite"].includes(String(item.itemType)) &&
  ["pending_review", "verified", "archived"].includes(String(item.reviewStatus)) &&
  isRecord(item.costBreakdown) && isRecord(item.costComposition) && isRecord(item.evidence) &&
  Number.isSafeInteger(item.priceVersion) && Array.isArray(item.searchTerms) &&
  item.searchTerms.every(term => typeof term === "string") && typeof item.updatedAt === "string";

export const parseCatalogList = (value: unknown): CatalogItemDTO[] => {
  if (!Array.isArray(value) || value.some(item => !isCatalogItem(item))) throw new ApiContractError("el catálogo");
  return value;
};

const parseCatalogPickerPage = (value: unknown): CatalogPickerPageDTO => {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.some(item => !isRecord(item) ||
    !Number.isSafeInteger(item.id) || typeof item.reference !== "string" || typeof item.category !== "string" ||
    typeof item.description !== "string" || typeof item.salePrice !== "number" || typeof item.vatRate !== "number" ||
    !Number.isSafeInteger(item.priceVersion)) || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.page) ||
    !Number.isSafeInteger(value.limit) || !Number.isSafeInteger(value.pages)) throw new ApiContractError("la búsqueda del catálogo");
  return value as unknown as CatalogPickerPageDTO;
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
  private pdfCacheGeneration = 0;

  constructor(private readonly http: ApiClient) {}
  clearPdfCache() {
    this.pdfCacheGeneration += 1;
    this.pdfCache.clear();
    this.pendingPdfs.clear();
  }
  opportunities() { return this.http.get<OpportunityDTO[]>("/opportunities"); }
  opportunity(id: number) { return this.http.get<OpportunityDTO>(`/opportunities/${id}`); }
  opportunityPage(query: { page: number; limit?: number; search?: string; status?: string }) {
    const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit ?? 20), search: query.search ?? "", status: query.status ?? "" });
    return this.http.get<OpportunityPageDTO>(`/opportunities?${params.toString()}`);
  }
  updateOpportunity(id: number, input: Partial<OpportunityDTO>, expectedUpdatedAt: string) { return this.http.patch<OpportunityDTO>(`/opportunities/${id}`, { ...input, expectedUpdatedAt }); }
  async catalog() { return parseCatalogList(await this.http.get<unknown>("/catalog")); }
  catalogSearch(search: string, references: string[] = [], page = 0, limit = 12) {
    const params = new URLSearchParams({ picker: "true", search, page: String(page), limit: String(limit) });
    if (references.length) params.set("references", references.join(","));
    return this.http.get<unknown>(`/catalog?${params.toString()}`).then(parseCatalogPickerPage);
  }
  async adminCatalog() { return parseCatalogList(await this.http.get<unknown>("/catalog?includeInactive=true")); }
  createCatalogItem(input: CatalogWriteDTO) { return this.http.post<CatalogItemDTO>("/catalog", input); }
  updateCatalogItem(id: number, input: Partial<CatalogWriteDTO>) { return this.http.patch<CatalogItemDTO>(`/catalog/${id}`, input); }
    archiveCatalogItem(id: number, expectedUpdatedAt: string) { return this.http.delete<CatalogItemDTO>(`/catalog/${id}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`); }
  createOpportunity(input: Omit<OpportunityDTO, "id" | "createdAt" | "updatedAt">) { return this.http.post<OpportunityDTO>("/opportunities", input); }
  async estimates(page = 0, search = "", status = "") { return parseEstimateList(await this.http.get<unknown>(`/estimates?page=${page}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`)); }
  async estimatesPage(page = 0, search = "", status = "") {
    const result = parseEstimateList(await this.http.get<unknown>(`/estimates?page=${page}&limit=21&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`));
    return { items: result.slice(0, 20), hasNext: result.length > 20 };
  }
  async history(id: number) { return parseEstimateList(await this.http.get<unknown>(`/estimates/${id}/history`)); }
  draft(id: number) { return this.http.get<AdminEstimateDTO>(`/estimates/${id}/draft`); }
  createEstimateDraft(oportunidadId: number, borrador: EstimateDraftDTO) { return this.http.post<AdminEstimateDTO>("/estimate-drafts", { oportunidadId, borrador }); }
  duplicateEstimate(id: number) { return this.http.post<AdminEstimateDTO>(`/estimates/${id}/duplicate`); }
  updateEstimate(id: number, borrador: EstimateDraftDTO, expectedUpdatedAt: string) { return this.http.patch<EstimateDTO>(`/estimates/${id}`, { borrador, expectedUpdatedAt }); }
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

    const generation = this.pdfCacheGeneration;
    const request = this.http.download(`/estimates/${id}/pdf?version=${version}`)
      .then(ensurePdf)
      .then(blob => {
        if (generation !== this.pdfCacheGeneration) return blob;
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
  cancelEstimate(id: number, motivo: string, expectedUpdatedAt: string) { return this.http.post<EstimateDTO>(`/estimates/${id}/cancel`, { motivo, expectedUpdatedAt }); }
  deleteEstimateDraft(id: number, expectedUpdatedAt: string) { return this.http.delete<void>(`/estimates/${id}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`); }
  convertToProject(id: number) { return this.http.post<{ id: number; estimateId: number }>(`/estimates/${id}/accept`); }
}
