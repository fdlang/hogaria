import type { CatalogItemDTO } from "@/features/sales/api/sales.api";

export type CatalogGroup = {
  category: string;
  items: CatalogItemDTO[];
};

export type CatalogFormValues = { reference: string; category: string; description: string; unit: string; salePrice: string; vatRate: string };

export function validateCatalogForm(form: CatalogFormValues): Partial<Record<keyof CatalogFormValues, string>> {
  const errors: Partial<Record<keyof CatalogFormValues, string>> = {};
  if (!form.reference.trim()) errors.reference = "La referencia es obligatoria";
  if (!form.category.trim()) errors.category = "La categoría es obligatoria";
  if (!form.description.trim()) errors.description = "La descripción es obligatoria";
  if (!form.unit.trim()) errors.unit = "La unidad es obligatoria";
  if (!form.salePrice.trim() || !Number.isFinite(Number(form.salePrice)) || Number(form.salePrice) < 0) errors.salePrice = "Indica un precio válido";
  if (!form.vatRate.trim() || !Number.isInteger(Number(form.vatRate)) || Number(form.vatRate) < 0 || Number(form.vatRate) > 100) errors.vatRate = "Indica un IVA válido";
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

    return [item.reference, item.category, item.description, item.unit]
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
