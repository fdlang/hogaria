export class DomainError extends Error { constructor(message: string, public readonly code = "DOMAIN_ERROR") { super(message); this.name = new.target.name; } }
export class ValidationError extends DomainError { constructor(message: string, public readonly field?: string) { super(message, "VALIDATION_ERROR"); } }
export class NotFoundError extends DomainError { constructor(resource = "Recurso") { super(`${resource} no encontrado`, "NOT_FOUND"); } }
export class UnauthorizedError extends DomainError { constructor(message = "No autorizado") { super(message, "UNAUTHORIZED"); } }
export class ForbiddenError extends DomainError { constructor(message = "No tienes permiso para realizar esta acción") { super(message, "FORBIDDEN"); } }
export class ConflictError extends DomainError { constructor(message = "Conflicto") { super(message, "CONFLICT"); } }
export class RateLimitError extends DomainError { constructor(message = "Demasiadas solicitudes") { super(message, "RATE_LIMIT"); } }
export class BudgetExpiredError extends DomainError { constructor(_date: Date) { super("El presupuesto ha caducado", "BUDGET_EXPIRED"); } }
export class SignatureInvalidError extends DomainError { constructor(message = "Firma no válida") { super(message, "SIGNATURE_INVALID"); } }
export class ChallengeActiveError extends DomainError { constructor(message = "Ya hay un proceso de firma activo") { super(message, "CHALLENGE_ACTIVE"); } }
