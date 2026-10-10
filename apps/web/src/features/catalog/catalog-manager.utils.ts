import type { CatalogItemDTO } from "@/features/sales/api/sales.api";
import { CURRENT_FISCAL_POLICY, hasAtMostTwoDecimals } from "@reformapro/domain";

export type CatalogGroup = {
  category: string;
  items: CatalogItemDTO[];
};

export type CatalogFormValues = {
  reference: string; category: string; description: string; unit: string; salePrice: string; vatRate: string;
  laborCost?: string; materialCost?: string; auxiliaryCost?: string; overheadPercent?: string;
  targetMarginPercent?: string; sourceName?: string; sourceUrl?: string; priceDate?: string;
  validFrom?: string; validUntil?: string; searchTerms?: string;
};

export function validateCatalogForm(form: CatalogFormValues): Partial<Record<keyof CatalogFormValues, string>> {
  const errors: Partial<Record<keyof CatalogFormValues, string>> = {};
  if (!form.reference.trim()) errors.reference = "La referencia es obligatoria";
  if (!form.category.trim()) errors.category = "La categoría es obligatoria";
  if (!form.description.trim()) errors.description = "La descripción es obligatoria";
  if (!form.unit.trim()) errors.unit = "La unidad es obligatoria";
  if (!form.salePrice.trim() || !Number.isFinite(Number(form.salePrice)) || Number(form.salePrice) < 0 || Number(form.salePrice) > 999_999_999.99 || !hasAtMostTwoDecimals(Number(form.salePrice))) errors.salePrice = "Indica un precio válido con hasta dos decimales";
  if (!form.vatRate.trim() || !CURRENT_FISCAL_POLICY.selectableVatRates.includes(Number(form.vatRate))) errors.vatRate = "Selecciona un IVA vigente";
  for (const field of ["laborCost", "materialCost", "auxiliaryCost", "overheadPercent", "targetMarginPercent"] as const) {
    const raw = form[field]?.trim() ?? "";
    if (!raw) continue;
    const value = Number(raw);
    const isRate = field === "overheadPercent" || field === "targetMarginPercent";
    const invalidLimit = isRate ? value > 100 || (field === "targetMarginPercent" && value >= 100) : value > 999_999_999.99;
    if (!Number.isFinite(value) || value < 0 || invalidLimit || !hasAtMostTwoDecimals(value)) errors[field] = "Indica un valor válido con hasta dos decimales";
  }
  const hasCosts = [form.laborCost, form.materialCost, form.auxiliaryCost].some(value => value?.trim());
  if (hasCosts && !form.sourceName?.trim()) errors.sourceName = "Indica la fuente de los costes";
  if (hasCosts && !form.priceDate?.trim()) errors.priceDate = "Indica la fecha de los costes";
  if (form.sourceUrl?.trim()) {
    try { const url = new URL(form.sourceUrl); if (!(["http:", "https:"] as string[]).includes(url.protocol)) throw new Error(); }
    catch { errors.sourceUrl = "Indica un enlace http o https válido"; }
  }
  if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) errors.validUntil = "La vigencia final no puede ser anterior a la inicial";
  const terms = form.searchTerms?.split(",").map(term => term.trim()).filter(Boolean) ?? [];
  if (terms.length > 20 || terms.some(term => term.length > 60)) errors.searchTerms = "Usa hasta 20 sinónimos de 60 caracteres";
  return errors;
}

function searchable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-ES");
}

export function catalogCategories(items: CatalogItemDTO[]) {
  return [...new Set(items.map((item) => item.category.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "es-ES"));
}

export function filterCatalogItems(
  items: CatalogItemDTO[],
  { search, category, includeArchived }: { search: string; category: string; includeArchived: boolean },
) {
  const query = searchable(search.trim());

  return items.filter((item) => {
    if (!includeArchived && !item.active) return false;
    if (category && item.category !== category) return false;
    if (!query) return true;

    return [item.reference, item.category, item.description, item.unit, ...item.searchTerms]
      .some((value) => searchable(value).includes(query));
  });
}

export function groupCatalogItems(items: CatalogItemDTO[]): CatalogGroup[] {
  const byCategory = new Map<string, CatalogItemDTO[]>();

  for (const item of items) {
    const category = item.category.trim() || "Sin categoría";
    const group = byCategory.get(category) ?? [];
    group.push(item);
    byCategory.set(category, group);
  }

  return [...byCategory.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "es-ES"))
    .map(([category, group]) => ({
      category,
      items: group.sort((left, right) => left.reference.localeCompare(right.reference, "es-ES")),
    }));
}
