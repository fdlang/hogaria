import type { CatalogCategory, CatalogItem } from "./catalog";

export const MAX_CATALOG_SHORTCUTS = 6;

export function parseCatalogReferences(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === "string").map(item => item.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_CATALOG_SHORTCUTS);
  } catch {
    return [];
  }
}

export function toggleCatalogFavorite(references: string[], reference: string): string[] {
  const normalized = reference.trim().toUpperCase();
  return references.includes(normalized)
    ? references.filter(item => item !== normalized)
    : [normalized, ...references].slice(0, MAX_CATALOG_SHORTCUTS);
}

export function rememberCatalogReference(references: string[], reference: string): string[] {
  const normalized = reference.trim().toUpperCase();
  return [normalized, ...references.filter(item => item !== normalized)].slice(0, MAX_CATALOG_SHORTCUTS);
}

export function catalogItemsForReferences(catalog: CatalogCategory[], references: string[]): Array<{ categoria: string; item: CatalogItem }> {
  const items = new Map(catalog.flatMap(category => category.items.map(item => [item.ref, { categoria: category.categoria, item }] as const)));
  return references.flatMap(reference => {
    const found = items.get(reference);
    return found ? [found] : [];
  });
}
