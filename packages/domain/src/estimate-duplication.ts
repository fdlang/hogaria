import type { EstimateDraft } from "./entities/index.js";

/**
 * Business rule HOG-EST-010.
 * Origin: business. A duplicated proposal is an independent working draft:
 * it keeps its commercial content but receives a distinguishable title and
 * fresh line identifiers. Valid from 2026-10-12; next review 2027-01-12.
 */
export function duplicateEstimateDraft(
  source: EstimateDraft,
  createId: () => string,
): EstimateDraft {
  const title = source.titulo.trim();
  const { referencia: _reference, ...content } = source;
  return {
    ...content,
    titulo: `Copia de ${title}`.slice(0, 300),
    partidas: source.partidas.map(line => ({ ...line, id: createId() })),
  };
}
