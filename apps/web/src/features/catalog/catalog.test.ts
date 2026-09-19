import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";

describe("catalogue seed data", () => {

  it("contains unique references and valid sale data", () => {
    const items = CATALOG.flatMap(category => category.items);
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map(item => item.ref)).size).toBe(items.length);
    expect(items.every(item => item.descripcion && item.unidad && item.precio >= 0 && item.iva >= 0)).toBe(true);
  });

});
