/**
 * Error middleware — maps DomainError to HTTP status without leaking internals.
 *
 * This is the ONLY place in the codebase that knows about HTTP status codes.
 * Use-cases throw typed domain errors; this middleware translates.
 */

import {
  DomainError, NotFoundError, UnauthorizedError, ForbiddenError,
  ValidationError, ConflictError, RateLimitError, ServiceUnavailableError,
} from "@reformapro/domain/errors";

interface HttpErrorResponse {
  status: number;
  body: { code: string; message: string; field?: string | undefined };
}

export function toHttpError(err: unknown): HttpErrorResponse {
  if (err instanceof UnauthorizedError)       return { status: 401, body: { code: err.code, message: err.message } };
  if (err instanceof ForbiddenError)          return { status: 403, body: { code: err.code, message: err.message } };
  if (err instanceof NotFoundError)           return { status: 404, body: { code: err.code, message: err.message } };
  if (err instanceof ConflictError)           return { status: 409, body: { code: err.code, message: err.message } };
  if (err instanceof RateLimitError)          return { status: 429, body: { code: err.code, message: err.message } };
  if (err instanceof ServiceUnavailableError) return { status: 503, body: { code: err.code, message: err.message } };
  if (err instanceof ValidationError) {
    const body: HttpErrorResponse["body"] = { code: err.code, message: err.message };
    if (err.field !== undefined) body.field = err.field;
    return { status: 422, body };
  }
  if (err instanceof DomainError)             return { status: 400, body: { code: err.code, message: err.message } };

  // Unknown error — never leak internals in production
  console.error("[unhandled]", err);
  return { status: 500, body: { code: "INTERNAL", message: "Error interno" } };
}
