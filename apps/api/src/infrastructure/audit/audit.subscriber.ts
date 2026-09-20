/**
 * AuditSubscriber — the bridge between domain events and the audit log.
 *
 * Why a separate subscriber instead of writing audit entries inside each use-case?
 *   1) SRP — use-cases do ONE business action. Audit is a cross-cutting concern.
 *   2) Decoupling — adding a new event type doesn't require modifying every caller.
 *   3) Testability — you can test a use-case without setting up an audit repo.
 *   4) Compliance — a single subscriber is a single integration point for SIEM,
 *      GDPR deletion, retention policies, etc.
 */

import { IAuditRepository } from "@reformapro/domain/repositories";
import { IEventEmitter, DomainEvent } from "@reformapro/domain/events";
import { AuditEntry } from "@reformapro/domain/entities";

// Map domain event types to audit action codes. Keeps the audit log stable
// even if we rename events in the domain layer.
const ACTION_CODES: Record<DomainEvent["type"], string> = {
  BudgetCreated:               "PRESUPUESTO_CREADO",
  BudgetSent:                  "PRESUPUESTO_ENVIADO",
  BudgetSigned:                "DOCUMENTO_FIRMADO",
  BudgetExpired:               "PRESUPUESTO_EXPIRADO",
  LoginSuccess:                "ACCESO_CORRECTO",
  UserCreated:                 "USUARIO_CREADO",
  UserDeactivated:             "USUARIO_DESACTIVADO",
  UserPasswordReset:           "CONTRASENA_RESETEADA",
  ProjectCreated:              "PROYECTO_CREADO",
  ProjectCompleted:            "PROYECTO_FINALIZADO",
  ProjectUpdated:              "PROYECTO_ACTUALIZADO",
  SignatureChallengeRequested: "FIRMA_CHALLENGE_SOLICITADO",
  SignatureRejected:           "FIRMA_INTENTO_INVALIDO",
  FileUploaded:                "ARCHIVO_SUBIDO",
  OpportunityCreated:          "OPORTUNIDAD_CREADA",
  EstimateCreated:             "PRESUPUESTO_CREADO",
  EstimateSent:                "PRESUPUESTO_ENVIADO",
  EstimateSigned:              "DOCUMENTO_FIRMADO",
  EstimateAccepted:            "PRESUPUESTO_ACEPTADO",
  EstimateRejected:            "PRESUPUESTO_RECHAZADO",
};

export class AuditSubscriber {
  constructor(
    private readonly events: IEventEmitter,
    private readonly audit: IAuditRepository,
  ) {}

  start(): void {
    (Object.keys(ACTION_CODES) as Array<DomainEvent["type"]>).forEach(type => {
      this.events.subscribe(type, evt => this.persist(evt));
    });
  }

  private async persist(evt: DomainEvent): Promise<void> {
    const entry: AuditEntry = {
      id: evt.eventId,
      action: ACTION_CODES[evt.type],
      userId: evt.actorId,
      userName: evt.actorName,
      details: this.redact(evt),
      timestamp: evt.occurredAt,
      ip: evt.ip ?? "unknown",
      userAgent: evt.userAgent ?? "unknown",
    };
    await this.audit.append(entry);
  }

  // Never include passwords, tokens or PII in the audit log payload.
  private redact(evt: DomainEvent): Record<string, unknown> {
    const { type, eventId: _, occurredAt: __, actorId: ___, actorName: ____, ip: _____, userAgent: ______, ...details } = evt;
    return { type, ...details };
  }
}
