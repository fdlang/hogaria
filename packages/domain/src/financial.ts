export interface EstimateFinancialLine {
  cantidad: number;
  precioVentaUnitario: number;
  descuento: number;
  iva: number;
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
