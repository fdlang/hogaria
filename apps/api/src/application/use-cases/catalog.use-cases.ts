import type { CatalogItem, User } from "@reformapro/domain/entities";
import type { ICatalogRepository, IUserRepository } from "@reformapro/domain/repositories";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@reformapro/domain/errors";
import {
  CATALOG_MEASUREMENT_UNITS, DEFAULT_CATALOG_TARIFF_ZONE, calculateCatalogComposition, calculateCatalogPrice,
  fiscalPolicyAt, hasAtMostTwoDecimals, isValidCatalogCostBreakdown, isValidCatalogCostComposition, catalogActivationIssues,
  type CatalogCostBreakdown, type CatalogCostComposition, type CatalogItemType, type CatalogPriceEvidence,
  type CatalogPricingMode, type CatalogReviewStatus, type CatalogTariffZone,
} from "@reformapro/domain";

type CatalogBaseInput = Pick<CatalogItem, "reference" | "category" | "description" | "unit" | "salePrice" | "vatRate">;
type CatalogInput = CatalogBaseInput & Partial<Pick<CatalogItem, "itemType" | "costBreakdown" | "costComposition" | "pricingMode" | "tariffZone" | "evidence" | "searchTerms" | "replacementReference" | "reviewNote">>;
type CatalogPatch = Partial<CatalogInput & Pick<CatalogItem, "active" | "reviewStatus">>;

const emptyCosts = (): CatalogCostBreakdown => ({ laborCost: null, materialCost: null, auxiliaryCost: null, overheadPercent: null, targetMarginPercent: null });
const emptyComposition = (): CatalogCostComposition => ({ labor: [], materials: [], auxiliaries: [] });
const emptyEvidence = (): CatalogPriceEvidence => ({ sourceName: null, sourceUrl: null, priceDate: null, validFrom: null, validUntil: null });

function assertAdmin(user: User | null): asserts user is User { if (!user || user.rol !== "admin") throw new ForbiddenError(); }

function normalize(input: CatalogInput): Omit<CatalogItem, "id" | "active" | "reviewStatus" | "createdAt" | "updatedAt"> {
  const reference = input.reference?.trim().toUpperCase();
  const category = input.category?.trim();
  const description = input.description?.trim();
  const unit = input.unit?.trim();
  if (!reference || !/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(reference)) throw new ValidationError("Referencia inválida", "reference");
  if (!category || category.length > 80) throw new ValidationError("Categoría obligatoria", "category");
  if (!description || description.length > 280) throw new ValidationError("Descripción obligatoria", "description");
  if (!CATALOG_MEASUREMENT_UNITS.includes(unit as never)) throw new ValidationError("Unidad no permitida", "unit");
  if (!Number.isInteger(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) throw new ValidationError("IVA inválido", "vatRate");
  if (!fiscalPolicyAt(new Date()).selectableVatRates.includes(input.vatRate)) throw new ValidationError("IVA no permitido por la política fiscal vigente", "vatRate");

  const itemType: CatalogItemType = input.itemType ?? "simple";
  if (!(["simple", "composite"] as const).includes(itemType)) throw new ValidationError("Tipo de partida inválido", "itemType");
  const pricingMode: CatalogPricingMode = input.pricingMode ?? "legacy_total";
  if (pricingMode !== "legacy_total" && pricingMode !== "decomposed") throw new ValidationError("Modo de cálculo inválido", "pricingMode");
  const tariffZone: CatalogTariffZone = input.tariffZone ?? DEFAULT_CATALOG_TARIFF_ZONE;
  if (tariffZone !== DEFAULT_CATALOG_TARIFF_ZONE) throw new ValidationError("Zona tarifaria no permitida", "tariffZone");
  const costComposition = input.costComposition ?? emptyComposition();
  if (!isValidCatalogCostComposition(costComposition)) throw new ValidationError("Composición de costes inválida", "costComposition");
  const costBreakdown = { ...emptyCosts(), ...input.costBreakdown, ...(pricingMode === "decomposed" ? calculateCatalogComposition(costComposition) : {}) };
  if (!isValidCatalogCostBreakdown(costBreakdown) || Object.values(costBreakdown).some(value => value != null && !hasAtMostTwoDecimals(value))) throw new ValidationError("Desglose de costes inválido", "costBreakdown");
  if (pricingMode === "decomposed" && costComposition.labor.length + costComposition.materials.length + costComposition.auxiliaries.length === 0) throw new ValidationError("Añade al menos un recurso al desglose", "costComposition");
  const salePrice = pricingMode === "decomposed" ? calculateCatalogPrice(costBreakdown).suggestedSalePrice : input.salePrice;
  if (salePrice == null || !Number.isFinite(salePrice) || salePrice < 0 || salePrice > 999_999_999.99 || !hasAtMostTwoDecimals(salePrice)) throw new ValidationError("Precio de venta inválido", "salePrice");

  const evidence = { ...emptyEvidence(), ...input.evidence };
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  for (const key of ["priceDate", "validFrom", "validUntil"] as const) if (evidence[key] != null) {
    const value = evidence[key]!;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!isoDate.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError("Fecha de precios inválida", `evidence.${key}`);
  }
  if (evidence.sourceUrl != null) {
    try { const url = new URL(evidence.sourceUrl); if (!(["http:", "https:"] as string[]).includes(url.protocol)) throw new Error(); }
    catch { throw new ValidationError("URL de fuente inválida", "evidence.sourceUrl"); }
  }
  if (evidence.validFrom && evidence.validUntil && evidence.validUntil < evidence.validFrom) throw new ValidationError("La vigencia final no puede ser anterior a la inicial", "evidence.validUntil");
  const hasCosts = [costBreakdown.laborCost, costBreakdown.materialCost, costBreakdown.auxiliaryCost].some(value => value != null);
  if (hasCosts && (!evidence.sourceName?.trim() || !evidence.priceDate)) throw new ValidationError("Los costes contrastados requieren fuente y fecha", "evidence.sourceName");
  evidence.sourceName = evidence.sourceName?.trim() || null;
  evidence.sourceUrl = evidence.sourceUrl?.trim() || null;

  const searchTerms = [...new Set((input.searchTerms ?? []).map(term => term.trim().toLocaleLowerCase("es")).filter(Boolean))];
  if (searchTerms.some(term => term.length > 60) || searchTerms.length > 20) throw new ValidationError("Sinónimos inválidos", "searchTerms");
  const replacementReference = input.replacementReference?.trim().toUpperCase() || null;
  if (replacementReference && !/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(replacementReference)) throw new ValidationError("Referencia sustituta inválida", "replacementReference");
  const reviewNote = input.reviewNote?.trim() || null;
  if (reviewNote && reviewNote.length > 500) throw new ValidationError("Nota de revisión demasiado larga", "reviewNote");
  return { reference, category, description, unit: unit as CatalogItem["unit"], salePrice, vatRate: input.vatRate, itemType, costBreakdown, costComposition, pricingMode, tariffZone, priceVersion: 1, evidence, searchTerms, replacementReference, reviewNote };
}

const assertReviewStatus = (value: unknown): CatalogReviewStatus => {
  if (!(typeof value === "string" && ["pending_review", "verified", "archived"].includes(value))) throw new ValidationError("Estado de revisión no válido", "reviewStatus");
  return value as CatalogReviewStatus;
};

function assertActivatable(item: Pick<CatalogItem, "salePrice" | "costBreakdown" | "evidence">) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const issues = catalogActivationIssues(item, today);
  if (issues.length) throw new ValidationError(`La partida no puede activarse: ${issues.join(", ")}`, "reviewStatus");
}

export class CatalogUseCases {
  constructor(private readonly users: IUserRepository, private readonly catalog: ICatalogRepository) {}
  async list(actorId: number, includeInactive = false) { assertAdmin(await this.users.findById(actorId)); return this.catalog.findAll(includeInactive); }
  async create(actorId: number, input: CatalogInput) {
    assertAdmin(await this.users.findById(actorId)); const item = normalize(input);
    if (await this.catalog.findByReference(item.reference)) throw new ConflictError("Ya existe una partida con esa referencia");
    return this.catalog.save({ ...item, active: false, reviewStatus: "pending_review" });
  }
  async update(actorId: number, id: number, input: CatalogPatch) {
    assertAdmin(await this.users.findById(actorId)); const current = await this.catalog.findById(id); if (!current) throw new NotFoundError("Partida de catálogo");
    if (input.active !== undefined && typeof input.active !== "boolean") throw new ValidationError("Estado no válido", "active");
    const reviewStatus = input.reviewStatus === undefined ? current.reviewStatus : assertReviewStatus(input.reviewStatus);
    const candidate = normalize({
      reference: input.reference ?? current.reference, category: input.category ?? current.category,
      description: input.description ?? current.description, unit: input.unit ?? current.unit,
      salePrice: input.salePrice ?? current.salePrice, vatRate: input.vatRate ?? current.vatRate,
      itemType: input.itemType ?? current.itemType,
      pricingMode: input.pricingMode ?? current.pricingMode ?? "legacy_total",
      tariffZone: input.tariffZone ?? current.tariffZone ?? DEFAULT_CATALOG_TARIFF_ZONE,
      costComposition: input.costComposition ?? current.costComposition ?? emptyComposition(),
      costBreakdown: { ...(current.costBreakdown ?? emptyCosts()), ...(input.costBreakdown ?? {}) },
      evidence: { ...(current.evidence ?? emptyEvidence()), ...(input.evidence ?? {}) },
      searchTerms: input.searchTerms ?? current.searchTerms ?? [],
      replacementReference: input.replacementReference !== undefined ? input.replacementReference : current.replacementReference,
      reviewNote: input.reviewNote !== undefined ? input.reviewNote : current.reviewNote,
    });
    if (candidate.reference !== current.reference) { const existing = await this.catalog.findByReference(candidate.reference); if (existing && existing.id !== id) throw new ConflictError("Ya existe una partida con esa referencia"); }
    if (candidate.replacementReference === candidate.reference) throw new ValidationError("Una partida no puede sustituirse por sí misma", "replacementReference");
    if (candidate.replacementReference && !(await this.catalog.findByReference(candidate.replacementReference))) throw new ValidationError("La referencia sustituta no existe", "replacementReference");
    const changes: Partial<Omit<CatalogItem, "id" | "createdAt" | "updatedAt">> = {};
    if (reviewStatus === "verified") assertActivatable(candidate);
    for (const key of ["reference", "category", "description", "unit", "salePrice", "vatRate", "itemType", "costBreakdown", "costComposition", "pricingMode", "tariffZone", "evidence", "searchTerms", "replacementReference", "reviewNote"] as const) {
      if (input[key] !== undefined) changes[key] = candidate[key] as never;
    }
    if (candidate.pricingMode === "decomposed" && (input.costComposition !== undefined || input.costBreakdown !== undefined || input.pricingMode !== undefined)) {
      changes.costBreakdown = candidate.costBreakdown;
      changes.salePrice = candidate.salePrice;
    }
    if (["unit", "salePrice", "costBreakdown", "costComposition", "pricingMode", "tariffZone", "evidence"].some(key => input[key as keyof CatalogPatch] !== undefined)) {
      changes.priceVersion = (current.priceVersion ?? 1) + 1;
    }
    if (input.reviewStatus !== undefined) changes.reviewStatus = reviewStatus;
    if (input.reviewStatus !== undefined || input.active !== undefined) changes.active = reviewStatus === "verified";
    return this.catalog.update(id, changes);
  }
  async archive(actorId: number, id: number) { assertAdmin(await this.users.findById(actorId)); if (!(await this.catalog.findById(id))) throw new NotFoundError("Partida de catálogo"); return this.catalog.update(id, { active: false, reviewStatus: "archived" }); }
}
