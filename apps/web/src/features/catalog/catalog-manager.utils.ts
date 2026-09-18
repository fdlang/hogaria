import type { CatalogItemDTO } from "@/features/sales/api/sales.api";

export type CatalogGroup = {
  category: string;
  items: CatalogItemDTO[];
};

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
