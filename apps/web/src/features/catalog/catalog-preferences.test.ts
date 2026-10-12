import { describe, expect, it } from "vitest";
import { catalogItemsForReferences, parseCatalogReferences, rememberCatalogReference, toggleCatalogFavorite } from "./catalog-preferences";

describe("catalog preferences", () => {
  it("normalizes, deduplicates and limits stored references", () => {
    expect(parseCatalogReferences('[" fon-001 ","FON-001","ALB-001","A","B","C","D","E"]')).toEqual(["FON-001", "ALB-001", "A", "B", "C", "D"]);
    expect(parseCatalogReferences("invalid")).toEqual([]);
  });

  it("toggles favorites and keeps recent items in most-recent-first order", () => {
    expect(toggleCatalogFavorite(["FON-001"], "fon-001")).toEqual([]);
    expect(toggleCatalogFavorite(["FON-001"], "alb-001")).toEqual(["ALB-001", "FON-001"]);
    expect(rememberCatalogReference(["FON-001", "ALB-001"], "alb-001")).toEqual(["ALB-001", "FON-001"]);
  });

  it("resolves shortcuts in preference order without loading the whole catalog", () => {
    const item = { ref: "FON-001", descripcion: "Punto de agua", unidad: "ud", precio: 10, iva: 21 };
    expect(catalogItemsForReferences([{ categoria: "Fontanería", items: [item] }], ["MISSING", "FON-001"])).toEqual([{ categoria: "Fontanería", item }]);
  });
});
