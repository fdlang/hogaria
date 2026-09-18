import { afterEach, describe, expect, it } from "vitest";
import { CATALOG, getRuntimeCatalog, setRuntimeCatalog } from "./catalog";

describe("catalogue fallback", () => {
  afterEach(() => {
    setRuntimeCatalog(CATALOG);
  });

  it("contains unique references and valid sale data", () => {
    const items = CATALOG.flatMap(category => category.items);
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map(item => item.ref)).size).toBe(items.length);
    expect(items.every(item => item.descripcion && item.unidad && item.precio >= 0 && item.iva >= 0)).toBe(true);
  });

  it("uses API catalogue data when it becomes available", () => {
    const managedCatalog = [{ categoria: "Prueba", items: [{ ref: "TST-001", descripcion: "Partida de prueba", unidad: "ud", precio: 100, iva: 21 }] }];
    setRuntimeCatalog(managedCatalog);
    expect(getRuntimeCatalog()).toEqual(managedCatalog);
  });
});
