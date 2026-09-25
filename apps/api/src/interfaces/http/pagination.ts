import { ValidationError } from "@reformapro/domain/errors";

export function wantsPagination(query?: Record<string, string | undefined>): boolean {
  return query?.page !== undefined || query?.limit !== undefined;
}

export function parsePagination(query: Record<string, string | undefined>): { page: number; limit: number } {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1) throw new ValidationError("Página no válida", "page");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ValidationError("Tamaño de página no válido", "limit");
  return { page, limit };
}
