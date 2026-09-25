import { describe, expect, it } from "vitest";
import { aggregateFiscalSnapshots, calculateEstimateTotals, createFiscalSnapshot } from "./financial.js";

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

describe("fiscal snapshots", () => {
  it("freezes the tax breakdown of the accepted version using line-level rounding", () => {
    const capturedAt = new Date("2026-09-25T10:00:00.000Z");
    const snapshot = createFiscalSnapshot([
      { cantidad: 3, precioVentaUnitario: 0.1, descuento: 0, iva: 21 },
      { cantidad: 1, precioVentaUnitario: 10, descuento: 10, iva: 10 },
    ], { type: "estimate", id: 7, version: 2 }, capturedAt);

    expect(snapshot).toEqual({
      baseAmount: 9.3,
      vatAmount: 0.96,
      totalAmount: 10.26,
      vatBreakdown: [
        { rate: 10, baseAmount: 9, vatAmount: 0.9, totalAmount: 9.9 },
        { rate: 21, baseAmount: 0.3, vatAmount: 0.06, totalAmount: 0.36 },
      ],
      source: { type: "estimate", id: 7, version: 2 },
      capturedAt,
    });
  });

  it("aggregates immutable estimate and change-order snapshots in cents", () => {
    const at = new Date("2026-09-25T10:00:00.000Z");
    const original = createFiscalSnapshot([{ cantidad: 1, precioVentaUnitario: 100, descuento: 0, iva: 21 }], { type: "estimate", id: 1, version: 1 }, at);
    const change = createFiscalSnapshot([{ cantidad: 1, precioVentaUnitario: 50, descuento: 0, iva: 10 }], { type: "change_order", id: 2 }, at);

    expect(aggregateFiscalSnapshots([original, change])).toEqual({
      baseAmount: 150,
      vatAmount: 26,
      totalAmount: 176,
      vatBreakdown: [
        { rate: 10, baseAmount: 50, vatAmount: 5, totalAmount: 55 },
        { rate: 21, baseAmount: 100, vatAmount: 21, totalAmount: 121 },
      ],
    });
  });
});
