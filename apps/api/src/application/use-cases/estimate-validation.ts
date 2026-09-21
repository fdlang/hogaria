import { ValidationError } from "@reformapro/domain/errors";
import type { EstimateDraft } from "@reformapro/domain/entities";
import { hasAtMostTwoDecimals } from "@reformapro/domain";
export function validateDraft(value: unknown): asserts value is EstimateDraft {
  const fail = (field?: string): never => {
    throw new ValidationError(
      field ? `Propuesta inválida: revisa ${field}` : "Propuesta inválida: revisa textos, importes y partidas",
      field,
    );
  };
  const object = (v: unknown, field?: string): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail(field);
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, max: number, required = false, field?: string) => {
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      fail(field);
  };
  const number = (v: unknown, min: number, max: number, field?: string) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      fail(field);
  };
  const draft = object(value);
  text(draft.titulo, 300, true, "titulo");
  for (const key of ["condicionesPago", "garantia", "notasCliente"])
    text(draft[key], 10000, false, key);
  for (const key of ["referencia", "notasInternas"])
    if (draft[key] !== undefined) text(draft[key], 10000, false, key);
  number(draft.validezDias, 1, 365, "validezDias");
  if (!Number.isInteger(draft.validezDias)) fail("validezDias");
  if (
    !Array.isArray(draft.partidas) ||
    draft.partidas.length === 0 ||
    draft.partidas.length > 1000
  )
    return fail("partidas");
  const ids = new Set<string>();
  let total = 0;
  for (const [index, entry] of draft.partidas.entries()) {
    const prefix = `partidas[${index}]`;
    const line = object(entry, prefix);
    text(line.id, 100, true, `${prefix}.id`);
    if (ids.has(line.id as string)) fail(`${prefix}.id`);
    ids.add(line.id as string);
    text(line.descripcion, 5000, true, `${prefix}.descripcion`);
    text(line.categoria, 300, true, `${prefix}.categoria`);
    text(line.unidad, 30, true, `${prefix}.unidad`);
    number(line.cantidad, 0.000001, 1_000_000, `${prefix}.cantidad`);
    number(line.precioVentaUnitario, 0, 100_000_000, `${prefix}.precioVentaUnitario`);
    number(line.descuento, 0, 100, `${prefix}.descuento`);
    number(line.iva, 0, 100, `${prefix}.iva`);
    if (line.costeUnitario != null) number(line.costeUnitario, 0, 100_000_000, `${prefix}.costeUnitario`);
    if (!hasAtMostTwoDecimals(line.precioVentaUnitario as number) ||
        !hasAtMostTwoDecimals(line.descuento as number) ||
        !hasAtMostTwoDecimals(line.iva as number) ||
        (line.costeUnitario != null && !hasAtMostTwoDecimals(line.costeUnitario as number))) fail(prefix);
    for (const key of ["notaCliente", "notaInterna"])
      if (line[key] !== undefined) text(line[key], 10000, false, `${prefix}.${key}`);
    total += (line.cantidad as number) * (line.precioVentaUnitario as number);
    if (total > 1_000_000_000) fail("partidas.total");
  }
  if (JSON.stringify(draft).length > 500_000) fail();
}
