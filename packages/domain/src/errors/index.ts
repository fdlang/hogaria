export class DomainError extends Error { constructor(message: string, public readonly code = "DOMAIN_ERROR") { super(message); this.name = new.target.name; } }
export class ValidationError extends DomainError { constructor(message: string, public readonly field?: string) { super(message, "VALIDATION_ERROR"); } }
export class NotFoundError extends DomainError { constructor(resource = "Recurso") { super(`${resource} no encontrado`, "NOT_FOUND"); } }
export class UnauthorizedError extends DomainError { constructor(message = "No autorizado") { super(message, "UNAUTHORIZED"); } }
export class ForbiddenError extends DomainError { constructor(message = "No tienes permiso para realizar esta acción") { super(message, "FORBIDDEN"); } }
export class ConflictError extends DomainError { constructor(message = "Conflicto") { super(message, "CONFLICT"); } }
export class RateLimitError extends DomainError { constructor(message = "Demasiadas solicitudes") { super(message, "RATE_LIMIT"); } }
export class ServiceUnavailableError extends DomainError { constructor(message = "Servicio temporalmente no disponible") { super(message, "SERVICE_UNAVAILABLE"); } }
