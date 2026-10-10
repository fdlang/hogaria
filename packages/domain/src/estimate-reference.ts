export const ESTIMATE_REFERENCE_POLICY = {
  prefix: "HOG",
  tokenLength: 13,
  validFrom: "2026-10-10",
  nextReview: "2027-01-10",
} as const;

export function createEstimateReference(year: number, entropy: string): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Año de referencia no válido");
  }
  const hexadecimal = entropy.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hexadecimal)) {
    throw new Error("Entropía de referencia no válida");
  }
  const token = BigInt(`0x${hexadecimal.slice(0, 16)}`)
    .toString(36)
    .toUpperCase()
    .padStart(ESTIMATE_REFERENCE_POLICY.tokenLength, "0");
  return `${ESTIMATE_REFERENCE_POLICY.prefix}-${year}-${token}`;
}
