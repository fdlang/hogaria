export type CatalogItemType = "simple" | "composite";
export type CatalogReviewStatus = "pending_review" | "verified" | "archived";
export type CatalogMeasurementUnit = "m²" | "ml" | "ud" | "h" | "global";
export type CatalogPricingMode = "legacy_total" | "decomposed";
export type CatalogTariffZone = "Madrid";

export interface CatalogLaborComponent {
  trade: string;
  performanceHoursPerUnit: number;
  hourlyCost: number;
}

export interface CatalogMaterialComponent {
  description: string;
  unit: string;
  quantityPerUnit: number;
  unitCost: number;
}

export interface CatalogAuxiliaryComponent {
  description: string;
  amountPerUnit: number;
}

export interface CatalogCostComposition {
  labor: CatalogLaborComponent[];
  materials: CatalogMaterialComponent[];
  auxiliaries: CatalogAuxiliaryComponent[];
}

export interface CatalogCostBreakdown {
  laborCost: number | null;
  materialCost: number | null;
  auxiliaryCost: number | null;
  overheadPercent: number | null;
  targetMarginPercent: number | null;
}

export interface CatalogPriceEvidence {
  sourceName: string | null;
  sourceUrl: string | null;
  priceDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface CatalogPriceCalculation {
  directCost: number;
  costWithOverhead: number | null;
  suggestedSalePrice: number | null;
}

export interface CatalogActivationCandidate {
  salePrice: number;
  costBreakdown: CatalogCostBreakdown;
  evidence: CatalogPriceEvidence;
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const validMoney = (value: number | null) => value == null || (Number.isFinite(value) && value >= 0 && value <= 999_999_999.99);
const validPercent = (value: number | null, upperExclusive = false) =>
  value == null || (Number.isFinite(value) && value >= 0 && (upperExclusive ? value < 100 : value <= 100));

export function isValidCatalogCostBreakdown(value: CatalogCostBreakdown): boolean {
  return validMoney(value.laborCost) && validMoney(value.materialCost) && validMoney(value.auxiliaryCost) &&
    validPercent(value.overheadPercent) && validPercent(value.targetMarginPercent, true);
}

export const CATALOG_MEASUREMENT_UNITS = ["m²", "ml", "ud", "h", "global"] as const;
export const DEFAULT_CATALOG_TARIFF_ZONE: CatalogTariffZone = "Madrid";

const validLabel = (value: string) => value.trim().length > 0 && value.trim().length <= 120;
const validQuantity = (value: number) => Number.isFinite(value) && value >= 0 && value <= 999_999_999.9999;

export function isValidCatalogCostComposition(value: CatalogCostComposition): boolean {
  if (value.labor.length > 100 || value.materials.length > 100 || value.auxiliaries.length > 100) return false;
  return value.labor.every(row => validLabel(row.trade) && validQuantity(row.performanceHoursPerUnit) && validMoney(row.hourlyCost)) &&
    value.materials.every(row => validLabel(row.description) && validLabel(row.unit) && validQuantity(row.quantityPerUnit) && validMoney(row.unitCost)) &&
    value.auxiliaries.every(row => validLabel(row.description) && validMoney(row.amountPerUnit));
}

/**
 * Derives unit costs from auditable resources instead of accepting editable totals.
 * Origin: business. Assumption: Madrid is the initial tariff zone and resources
 * are expressed per catalogue unit. Valid from 2026-10-10. Next review 2027-01-10.
 */
export function calculateCatalogComposition(value: CatalogCostComposition): Pick<CatalogCostBreakdown, "laborCost" | "materialCost" | "auxiliaryCost"> {
  if (!isValidCatalogCostComposition(value)) throw new RangeError("Composición de costes no válida");
  return {
    laborCost: cents(value.labor.reduce((sum, row) => sum + row.performanceHoursPerUnit * row.hourlyCost, 0)),
    materialCost: cents(value.materials.reduce((sum, row) => sum + row.quantityPerUnit * row.unitCost, 0)),
    auxiliaryCost: cents(value.auxiliaries.reduce((sum, row) => sum + row.amountPerUnit, 0)),
  };
}

/**
 * Calculates a traceable sales reference from direct cost, overhead and target
 * gross margin. Missing rates deliberately produce no suggested price.
 */
export function calculateCatalogPrice(value: CatalogCostBreakdown): CatalogPriceCalculation {
  if (!isValidCatalogCostBreakdown(value)) throw new RangeError("Desglose de costes no válido");
  const directCost = cents((value.laborCost ?? 0) + (value.materialCost ?? 0) + (value.auxiliaryCost ?? 0));
  if (value.overheadPercent == null) return { directCost, costWithOverhead: null, suggestedSalePrice: null };
  const costWithOverhead = cents(directCost * (1 + value.overheadPercent / 100));
  if (value.targetMarginPercent == null) return { directCost, costWithOverhead, suggestedSalePrice: null };
  return {
    directCost,
    costWithOverhead,
    suggestedSalePrice: cents(costWithOverhead / (1 - value.targetMarginPercent / 100)),
  };
}

const realIsoDate = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/**
 * Business activation gate for a commercial catalogue price.
 * Origin: business/security. Assumption: only traceable prices within their
 * declared validity window may be offered in new estimates.
 * Valid from 2026-10-10. Next review 2027-01-10.
 */
export function catalogActivationIssues(value: CatalogActivationCandidate, today: string): string[] {
  const issues: string[] = [];
  if (!realIsoDate(today)) throw new RangeError("Fecha de control no válida");
  if (!Number.isFinite(value.salePrice) || value.salePrice <= 0) issues.push("sale_price");
  if (!value.evidence.sourceName?.trim()) issues.push("source");
  if (!realIsoDate(value.evidence.priceDate)) issues.push("price_date");
  if (!realIsoDate(value.evidence.validFrom)) issues.push("valid_from");
  if (!realIsoDate(value.evidence.validUntil)) issues.push("valid_until");
  if (realIsoDate(value.evidence.priceDate) && value.evidence.priceDate > today) issues.push("future_price_date");
  if (realIsoDate(value.evidence.validFrom) && value.evidence.validFrom > today) issues.push("not_yet_valid");
  if (realIsoDate(value.evidence.validUntil) && value.evidence.validUntil < today) issues.push("expired");
  const calculation = calculateCatalogPrice(value.costBreakdown);
  if (calculation.costWithOverhead != null && value.salePrice < calculation.costWithOverhead) issues.push("below_cost");
  return issues;
}

export interface EstimateTemplate {
  id: "bathroom" | "kitchen" | "wardrobes";
  name: string;
  description: string;
  items: readonly { reference: string; quantity: number; measurement?: "floorArea" | "wallArea" | "linearMetres" }[];
}

export const ESTIMATE_TEMPLATES: readonly EstimateTemplate[] = [
  {
    id: "bathroom",
    name: "Baño completo",
    description: "Demolición, instalaciones, revestimientos y equipamiento esencial.",
    items: [
      { reference: "PRE-001", quantity: 1 },
      { reference: "DEM-003", quantity: 1, measurement: "floorArea" },
      { reference: "DEM-004", quantity: 1, measurement: "wallArea" },
      { reference: "DEM-005", quantity: 1 },
      { reference: "FON-003", quantity: 1 },
      { reference: "REV-001", quantity: 1, measurement: "wallArea" },
      { reference: "REV-003", quantity: 1, measurement: "floorArea" },
      { reference: "REV-005", quantity: 1, measurement: "floorArea" },
      { reference: "BAN-001", quantity: 1 },
      { reference: "BAN-002", quantity: 1 },
      { reference: "BAN-005", quantity: 1 },
      { reference: "BAN-006", quantity: 1 },
      { reference: "CLI-003", quantity: 1 },
      { reference: "PRE-004", quantity: 1 },
    ],
  },
  {
    id: "kitchen",
    name: "Cocina completa",
    description: "Desmontaje, instalaciones, revestimientos y mobiliario base.",
    items: [
      { reference: "PRE-001", quantity: 1 },
      { reference: "DEM-003", quantity: 1, measurement: "floorArea" },
      { reference: "FON-004", quantity: 1 },
      { reference: "REV-003", quantity: 1, measurement: "floorArea" },
      { reference: "COC-001", quantity: 1, measurement: "linearMetres" },
      { reference: "COC-002", quantity: 1, measurement: "linearMetres" },
      { reference: "COC-003", quantity: 1, measurement: "linearMetres" },
      { reference: "COC-005", quantity: 1 },
      { reference: "PRE-004", quantity: 1 },
    ],
  },
  {
    id: "wardrobes",
    name: "Armarios a medida",
    description: "Fabricación y montaje medidos por longitud de frente.",
    items: [
      { reference: "CAR-003", quantity: 1, measurement: "linearMetres" },
    ],
  },
] as const;
