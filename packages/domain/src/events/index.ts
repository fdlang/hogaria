type Base = { type: string; eventId: string; occurredAt: Date; actorId: number; actorName: string; ip?: string; userAgent?: string; };
export type BudgetSigned = Base & { type: "BudgetSigned"; budgetId: number; hash: string };
export type DomainEvent = BudgetSigned | (Base & { type: "BudgetCreated" | "BudgetSent" | "BudgetExpired" | "UserCreated" | "UserDeactivated" | "UserPasswordReset" | "ProjectCreated" | "ProjectCompleted" | "SignatureChallengeRequested" | "SignatureRejected" | "FileUploaded" | "OpportunityCreated" | "EstimateCreated" | "EstimateSent" | "EstimateAccepted"; [key: string]: unknown });
export interface IEventEmitter { emit(event: DomainEvent): Promise<void>; subscribe(type: DomainEvent["type"], handler: (event: DomainEvent) => void | Promise<void>): () => void; }
