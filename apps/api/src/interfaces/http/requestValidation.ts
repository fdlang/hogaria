import { ValidationError } from "@reformapro/domain/errors";

export const positiveId = (value: unknown, field = "id") => {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError("Identificador no válido", field);
  return id;
};

export const pageIndex = (value: unknown, field = "page") => {
  const page = value === undefined || value === "" ? 0 : Number(value);
  if (!Number.isSafeInteger(page) || page < 0) throw new ValidationError("Página no válida", field);
  return page;
};

export const validDate = (value: string | undefined, field: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ValidationError("Fecha no válida", field);
  return date;
};

export const optionalDateInput = (value: unknown, field: string) => {
  if (value != null && typeof value !== "string") throw new ValidationError("Fecha no válida", field);
  return validDate(value ?? undefined, field);
};
