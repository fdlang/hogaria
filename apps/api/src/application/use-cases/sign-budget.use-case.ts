/**
 * SignBudgetUseCase — the most sensitive operation in the system.
 * Encapsulates: challenge verification, password re-auth, expiration check,
 * hash computation, audit trail assembly, and state transition.
 *
 * Public surface is a single .execute(cmd) — no helpers leak.
 */

import { IBudgetRepository, IChallengeRepository, IUserRepository } from "@reformapro/domain/repositories";
import { IEventEmitter, BudgetSigned } from "@reformapro/domain/events";
import { Signature, AuditEntry, Budget } from "@reformapro/domain/entities";
import { Email, DocumentHash } from "@reformapro/domain/value-objects";
import {
  NotFoundError, ForbiddenError, ValidationError, ConflictError,
  BudgetExpiredError, SignatureInvalidError
} from "@reformapro/domain/errors";
import { ClientContext } from "./auth.use-cases.js";
import { PermissionPolicy } from "@reformapro/domain/services";

// Crypto port — signed in production by a server-side HMAC with an env-loaded secret.
export interface ISignatureCrypto {
  generateSignatureToken(budgetId: number, userId: number, timestamp: number): Promise<string>;
  verifySignatureToken(token: string, budgetId: number, userId: number, timestamp: number): Promise<boolean>;
  hashDocument(serialized: string): Promise<DocumentHash>;
  randomChallenge(): string;
}

export interface SignBudgetCommand {
  actorId: number;         // may be the cliente themselves OR the admin signing on their behalf
  budgetId: number;
  token: string;           // signature token from challenge response
  timestamp: number;       // timestamp issued in the challenge
  canvasSignature: string; // base64 PNG of hand-drawn signature
  password: string;        // re-auth: cliente's password (admin uses their own)
  consentimiento: string;  // the exact text the user agreed to
  ctx: ClientContext;
}

export class SignBudgetUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly budgets: IBudgetRepository,
    private readonly challenges: IChallengeRepository,
    private readonly crypto: ISignatureCrypto,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: SignBudgetCommand): Promise<{ hash: string; token: string; fechaFirma: Date }> {
    // 1) Load actors
    const actor  = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError("Actor desconocido");

    const budget = await this.budgets.findById(cmd.budgetId);
    if (!budget) throw new NotFoundError("Presupuesto");

    // 2) Business invariants
    if (budget.firma?.isValid()) throw new ConflictError("Ya está firmado");
    if (budget.hasExpired())     throw new BudgetExpiredError(budget.fechaExpiracion!);

    // 3) Authorize: cliente must own the budget, admin can sign on behalf of
    const isAdminSigning = actor.rol === "admin";
    if (!isAdminSigning) {
      PermissionPolicy.authorize(actor, "budget.sign", { budget });
    }

    // 4) Re-authenticate password server-side (never trust the client)
    const verified = await this.users.verifyPassword(actor.email.value, cmd.password);
    if (!verified || verified.id !== actor.id) throw new SignatureInvalidError();

    // 5) Verify challenge
    const challenge = await this.challenges.get(budget.id);
    if (!challenge)                              throw new SignatureInvalidError();
    if (challenge.userId !== budget.clienteId)   throw new SignatureInvalidError();
    if (Date.now() > challenge.exp)              throw new SignatureInvalidError();
    if (challenge.timestamp !== cmd.timestamp)   throw new SignatureInvalidError();

    const tokenOk = await this.crypto.verifySignatureToken(
      cmd.token, budget.id, budget.clienteId, cmd.timestamp
    );
    if (!tokenOk) throw new SignatureInvalidError();

    // 6) Compute document hash from a canonical serialization
    //    (excludes mutable metadata like `_challengePending`)
    const canonical = JSON.stringify(this.canonicalize(budget));
    const hash = await this.crypto.hashDocument(canonical);

    // 7) Assemble audit trail and signature
    const now = new Date();
    const auditEntries: AuditEntry[] = [
      this.audit("FIRMA_CHALLENGE_VERIFICADO", actor.id, actor.nombre, { budgetId: budget.id }, cmd.ctx),
      this.audit("FIRMA_PASSWORD_VERIFICADO",  actor.id, actor.nombre, { budgetId: budget.id }, cmd.ctx),
      this.audit("DOCUMENTO_FIRMADO",          actor.id, actor.nombre, {
        budgetId: budget.id, hash: hash.value, ...(isAdminSigning && { firmadoPorAdmin: true })
      }, cmd.ctx),
    ];

    const signature = new Signature(
      /* firmado        */ true,
      /* firmante       */ isAdminSigning ? `${actor.nombre} (en nombre del cliente)` : actor.nombre,
      /* firmanteEmail  */ Email.of((await this.users.findById(budget.clienteId))!.email.value),
      /* fechaFirma     */ now,
      /* ip             */ cmd.ctx.ip,
      /* hash           */ hash,
      /* token          */ cmd.token,
      /* consentimiento */ cmd.consentimiento,
      /* auditTrail     */ auditEntries,
    );

    // 8) Persist & emit events atomically (in production: DB transaction)
    await this.budgets.update(budget.id, { firma: signature, estado: "firmado" as const });
    await this.challenges.delete(budget.id);

    const evt: BudgetSigned = {
      type: "BudgetSigned", eventId: crypto.randomUUID(), occurredAt: now,
      actorId: actor.id, actorName: actor.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
      budgetId: budget.id, hash: hash.value,
    };
    await this.events.emit(evt);

    return { hash: hash.value, token: cmd.token, fechaFirma: now };
  }

  private canonicalize(b: Budget): Record<string, unknown> {
    // Deterministic key order so hash is reproducible.
    return {
      id: b.id, proyectoId: b.proyectoId, clienteId: b.clienteId,
      nombre: b.nombre, referencia: b.referencia,
      ivaDefault: b.ivaDefault.value, validezDias: b.validezDias,
      fechaCreacion: b.fechaCreacion.toISOString(),
      fechaEnvio: b.fechaEnvio?.toISOString() ?? null,
      condicionesPago: b.condicionesPago, garantia: b.garantia, notas: b.notas,
      partidas: b.partidas.map(p => ({
        id: p.id, categoria: p.categoria, descripcion: p.descripcion,
        cantidad: p.cantidad, unidad: p.unidad,
        precioUnit: p.precioUnit.amount,
        descuento: p.descuento.value,
        iva: p.iva?.value ?? null,
        ref: p.ref ?? null, nota: p.nota ?? null,
      })),
    };
  }

  private audit(action: string, userId: number, userName: string, details: Record<string, unknown>, ctx: ClientContext): AuditEntry {
    return {
      id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      action, userId, userName, details,
      timestamp: new Date(),
      ip: ctx.ip, userAgent: ctx.userAgent,
    };
  }
}
