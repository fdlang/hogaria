import { describe, expect, it } from "vitest";
import { calculateEstimateTotals } from "./financial.js";

describe("calculateEstimateTotals", () => {
  it("rounds each line and its tax to euro cents", () => {
    expect(calculateEstimateTotals([
      { cantidad: 3, precioVentaUnitario: 0.1, descuento: 0, iva: 21 },
    ])).toEqual({ totalSinIva: 0.3, totalIva: 0.06, totalConIva: 0.36 });
  });

  it("sums integer cents instead of accumulating floating-point residues", () => {
    expect(calculateEstimateTotals([
      { cantidad: 1, precioVentaUnitario: 0.1, descuento: 0, iva: 0 },
      { cantidad: 1, precioVentaUnitario: 0.2, descuento: 0, iva: 0 },
    ])).toEqual({ totalSinIva: 0.3, totalIva: 0, totalConIva: 0.3 });
  });
});
