import { ValidationError } from "./errors/index.js";

export interface FiscalPolicy {
  validFrom: string;
  validUntil: string | null;
  defaultVatRate: number;
  selectableVatRates: readonly number[];
  externalValidation: "gestor";
}

export const FISCAL_POLICIES: readonly FiscalPolicy[] = [{
  validFrom: "2026-09-26",
  validUntil: null,
  defaultVatRate: 21,
  selectableVatRates: [21, 10, 4, 0],
  externalValidation: "gestor",
}];

export function fiscalPolicyAt(at: Date): FiscalPolicy {
  const date = at.toISOString().slice(0, 10);
  const policy = [...FISCAL_POLICIES].reverse().find((candidate) =>
    candidate.validFrom <= date && (!candidate.validUntil || date <= candidate.validUntil));
  if (!policy) throw new ValidationError("No hay parametros fiscales vigentes para la fecha");
  return policy;
}

export const CURRENT_FISCAL_POLICY = FISCAL_POLICIES[FISCAL_POLICIES.length - 1]!;
