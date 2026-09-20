import { describe, expect, it } from "vitest";
import type { CatalogItemDTO } from "@/features/sales/api/sales.api";
import { catalogCategories, filterCatalogItems, groupCatalogItems, validateCatalogForm } from "./catalog-manager.utils";

const items: CatalogItemDTO[] = [
  { id: 1, reference: "BAN-002", category: "Baño", description: "Mampara de vidrio", unit: "ud", salePrice: 950, vatRate: 21, active: true, updatedAt: "2026-01-01" },
  { id: 2, reference: "ALB-001", category: "Albañilería", description: "Tabique de pladur", unit: "m²", salePrice: 58, vatRate: 21, active: true, updatedAt: "2026-01-01" },
  { id: 3, reference: "BAN-003", category: "Baño", description: "Inodoro suspendido", unit: "ud", salePrice: 790, vatRate: 21, active: false, updatedAt: "2026-01-01" },
];

describe("catalog manager utilities", () => {
  it("derives ordered categories without duplicates", () => {
    expect(catalogCategories(items)).toEqual(["Albañilería", "Baño"]);
  });

  it("searches references and accent-insensitive descriptions, excluding archived entries by default", () => {
    expect(filterCatalogItems(items, { search: "albanileria", category: "", includeArchived: false }).map((item) => item.id)).toEqual([2]);
    expect(filterCatalogItems(items, { search: "BAN-003", category: "", includeArchived: false })).toEqual([]);
  });

  it("filters by category and includes archived entries only when requested", () => {
    expect(filterCatalogItems(items, { search: "", category: "Baño", includeArchived: true }).map((item) => item.id)).toEqual([1, 3]);
  });

  it("groups displayed items by category and orders each chapter by reference", () => {
    const groups = groupCatalogItems([items[2], items[0], items[1]]);
    expect(groups.map((group) => group.category)).toEqual(["Albañilería", "Baño"]);
    expect(groups[1].items.map((item) => item.reference)).toEqual(["BAN-002", "BAN-003"]);
  });

  it("does not treat an empty required price as zero", () => {
    expect(validateCatalogForm({ reference: "DEM-1", category: "Demoliciones", description: "Trabajo", unit: "ud", salePrice: "", vatRate: "21" })).toHaveProperty("salePrice");
    expect(validateCatalogForm({ reference: "DEM-1", category: "Demoliciones", description: "Trabajo", unit: "ud", salePrice: "0", vatRate: "21" })).toEqual({});
  });
});
