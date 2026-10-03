export class ApiContractError extends Error {
  readonly code = "INVALID_RESPONSE";

  constructor(resource: string) {
    super(`El servidor devolvió una respuesta no válida para ${resource}.`);
    this.name = "ApiContractError";
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
