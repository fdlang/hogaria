import { ValidationError } from "@reformapro/domain/errors";
import type { EstimateDraft } from "@reformapro/domain/entities";
export function validateDraft(value: unknown): asserts value is EstimateDraft {
  const fail = (): never => {
    throw new ValidationError(
      "Propuesta inválida: revisa textos, importes y partidas",
    );
  };
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, max: number, required = false) => {
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      fail();
  };
  const number = (v: unknown, min: number, max: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      fail();
  };
  const draft = object(value);
  text(draft.titulo, 300, true);
  for (const key of ["condicionesPago", "garantia", "notasCliente"])
    text(draft[key], 10000);
  for (const key of ["referencia", "notasInternas"])
    if (draft[key] !== undefined) text(draft[key], 10000);
  number(draft.validezDias, 1, 365);
  if (!Number.isInteger(draft.validezDias)) fail();
  if (
    !Array.isArray(draft.partidas) ||
    draft.partidas.length === 0 ||
    draft.partidas.length > 1000
  )
    return fail();
  const ids = new Set<string>();
  let total = 0;
  for (const entry of draft.partidas) {
    const line = object(entry);
    text(line.id, 100, true);
    if (ids.has(line.id as string)) fail();
    ids.add(line.id as string);
    text(line.descripcion, 5000, true);
    text(line.categoria, 300, true);
    text(line.unidad, 30, true);
    number(line.cantidad, 0.000001, 1_000_000);
    number(line.precioVentaUnitario, 0, 100_000_000);
    number(line.descuento, 0, 100);
    number(line.iva, 0, 100);
    if (line.costeUnitario != null) number(line.costeUnitario, 0, 100_000_000);
    for (const key of ["notaCliente", "notaInterna"])
      if (line[key] !== undefined) text(line[key], 10000);
    total += (line.cantidad as number) * (line.precioVentaUnitario as number);
    if (total > 1_000_000_000) fail();
  }
  if (JSON.stringify(draft).length > 500_000) fail();
}
