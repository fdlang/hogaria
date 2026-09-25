export interface EstimateFinancialLine {
  cantidad: number;
  precioVentaUnitario: number;
  descuento: number;
  iva: number;
}

export interface FiscalAmountBreakdown {
  rate: number;
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export type FiscalSnapshotSource =
  | { type: "estimate"; id: number; version: number }
  | { type: "change_order"; id: number };

export interface FiscalSnapshot {
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
  vatBreakdown: FiscalAmountBreakdown[];
  source: FiscalSnapshotSource;
  capturedAt: Date;
}

const cents = (amount: number): number => Math.round((amount + Number.EPSILON) * 100);
const euros = (value: number): number => value / 100;

export function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

export function calculateEstimateLineTotals(line: EstimateFinancialLine) {
  const netCents = cents(line.cantidad * line.precioVentaUnitario * (1 - line.descuento / 100));
  const vatCents = Math.round(netCents * line.iva / 100);
  return {
    totalSinIva: euros(netCents),
    totalIva: euros(vatCents),
    totalConIva: euros(netCents + vatCents),
  };
}

export function calculateEstimateTotals(lines: readonly EstimateFinancialLine[]) {
  const totals = lines.reduce(
    (sum, line) => {
      const current = calculateEstimateLineTotals(line);
      return {
        netCents: sum.netCents + cents(current.totalSinIva),
        vatCents: sum.vatCents + cents(current.totalIva),
      };
    },
    { netCents: 0, vatCents: 0 },
  );
  return {
    totalSinIva: euros(totals.netCents),
    totalIva: euros(totals.vatCents),
    totalConIva: euros(totals.netCents + totals.vatCents),
  };
}

function aggregateByVatRate(lines: readonly EstimateFinancialLine[]): FiscalAmountBreakdown[] {
  const grouped = new Map<number, { baseCents: number; vatCents: number }>();
  for (const line of lines) {
    const totals = calculateEstimateLineTotals(line);
    const current = grouped.get(line.iva) ?? { baseCents: 0, vatCents: 0 };
    current.baseCents += cents(totals.totalSinIva);
    current.vatCents += cents(totals.totalIva);
    grouped.set(line.iva, current);
  }
  return [...grouped.entries()].sort(([left], [right]) => left - right).map(([rate, amounts]) => ({
    rate,
    baseAmount: euros(amounts.baseCents),
    vatAmount: euros(amounts.vatCents),
    totalAmount: euros(amounts.baseCents + amounts.vatCents),
  }));
}

export function createFiscalSnapshot(
  lines: readonly EstimateFinancialLine[],
  source: FiscalSnapshotSource,
  capturedAt: Date,
): FiscalSnapshot {
  const totals = calculateEstimateTotals(lines);
  return {
    baseAmount: totals.totalSinIva,
    vatAmount: totals.totalIva,
    totalAmount: totals.totalConIva,
    vatBreakdown: aggregateByVatRate(lines),
    source,
    capturedAt: new Date(capturedAt),
  };
}

export function aggregateFiscalSnapshots(snapshots: readonly FiscalSnapshot[]) {
  const grouped = new Map<number, { baseCents: number; vatCents: number }>();
  for (const snapshot of snapshots) {
    for (const item of snapshot.vatBreakdown) {
      const current = grouped.get(item.rate) ?? { baseCents: 0, vatCents: 0 };
      current.baseCents += cents(item.baseAmount);
      current.vatCents += cents(item.vatAmount);
      grouped.set(item.rate, current);
    }
  }
  const vatBreakdown = [...grouped.entries()].sort(([left], [right]) => left - right).map(([rate, amounts]) => ({
    rate,
    baseAmount: euros(amounts.baseCents),
    vatAmount: euros(amounts.vatCents),
    totalAmount: euros(amounts.baseCents + amounts.vatCents),
  }));
  const baseCents = vatBreakdown.reduce((sum, item) => sum + cents(item.baseAmount), 0);
  const vatCents = vatBreakdown.reduce((sum, item) => sum + cents(item.vatAmount), 0);
  return { baseAmount: euros(baseCents), vatAmount: euros(vatCents), totalAmount: euros(baseCents + vatCents), vatBreakdown };
}
