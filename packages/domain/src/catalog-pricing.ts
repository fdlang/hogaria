export type CatalogItemType = "simple" | "composite";

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

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const validMoney = (value: number | null) => value == null || (Number.isFinite(value) && value >= 0 && value <= 999_999_999.99);
const validPercent = (value: number | null, upperExclusive = false) =>
  value == null || (Number.isFinite(value) && value >= 0 && (upperExclusive ? value < 100 : value <= 100));

export function isValidCatalogCostBreakdown(value: CatalogCostBreakdown): boolean {
  return validMoney(value.laborCost) && validMoney(value.materialCost) && validMoney(value.auxiliaryCost) &&
    validPercent(value.overheadPercent) && validPercent(value.targetMarginPercent, true);
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
