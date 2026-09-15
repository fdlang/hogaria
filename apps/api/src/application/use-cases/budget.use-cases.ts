/**
 * Budget use cases — pure orchestration.
 * Each class enforces the business rules for ONE action and emits a domain event.
 */

import { IBudgetRepository, IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import { IEventEmitter } from "@reformapro/domain/events";
import { Budget, BudgetLine, User } from "@reformapro/domain/entities";
import { IVARate, Money, Percentage } from "@reformapro/domain/value-objects";
import { ValidationError, ForbiddenError, NotFoundError, ConflictError } from "@reformapro/domain/errors";
import { PermissionPolicy } from "@reformapro/domain/services";
import { ClientContext } from "./auth.use-cases.js";

export interface CreateBudgetCommand {
  actorId: number;
  proyectoId: number;
  clienteId: number;
  nombre: string;
  referencia: string;
  ivaDefault: number;
  validezDias: number;
  condicionesPago: string;
  garantia: string;
  notas: string;
  partidas: Array<{
    categoria: string; descripcion: string; cantidad: number; unidad: string;
    precioUnit: number; descuento: number; iva: number | null;
    ref?: string; nota?: string;
  }>;
  ctx: ClientContext;
}

export class CreateBudgetUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly budgets: IBudgetRepository,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: CreateBudgetCommand): Promise<Budget> {
    // 1) Actor + admin-only
    const actor = await this.requireAdmin(cmd.actorId);

    // 2) Referential integrity
    const project = await this.projects.findById(cmd.proyectoId);
    if (!project) throw new NotFoundError("Proyecto");
    const client  = await this.users.findById(cmd.clienteId);
    if (!client || client.rol !== "cliente") throw new ValidationError("Cliente no válido", "clienteId");
    if (project.clienteId !== cmd.clienteId) {
      throw new ValidationError("El cliente no coincide con el del proyecto", "clienteId");
    }

    // 3) Validate business invariants
    if (!cmd.nombre?.trim()) throw new ValidationError("Nombre obligatorio", "nombre");
    if (cmd.partidas.length === 0) throw new ValidationError("Al menos una partida", "partidas");
    if (cmd.validezDias < 1 || cmd.validezDias > 365) {
      throw new ValidationError("Validez debe estar entre 1 y 365 días", "validezDias");
    }

    // 4) Map DTO → domain objects (fails fast on invalid input)
    const lines = cmd.partidas.map((p, i) => new BudgetLine(
      crypto.randomUUID(),
      p.categoria, p.descripcion, p.cantidad, p.unidad,
      Money.of(p.precioUnit),
      Percentage.of(p.descuento),
      p.iva != null ? IVARate.of(p.iva) : null,
      p.ref, p.nota,
    ));

    const budget = new Budget(
      /* id             */ 0, // assigned by repository
      cmd.proyectoId, cmd.clienteId, cmd.nombre.trim(), cmd.referencia,
      /* estado         */ "borrador",
      /* ivaDefault     */ IVARate.of(cmd.ivaDefault),
      cmd.validezDias,
      /* fechaCreacion  */ new Date(),
      /* fechaEnvio     */ null,
      cmd.condicionesPago, cmd.garantia, cmd.notas,
      lines,
      /* firma          */ null,
    );

    const saved = await this.budgets.save(budget);
    await this.events.emit({
      type: "BudgetCreated", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor.id, actorName: actor.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
      budgetId: saved.id, projectId: cmd.proyectoId,
    });
    return saved;
  }

  private async requireAdmin(actorId: number): Promise<User> {
    const actor = await this.users.findById(actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    return actor;
  }
}

export class SendBudgetUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly budgets: IBudgetRepository,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: { actorId: number; budgetId: number; ctx: ClientContext }): Promise<Budget> {
    const actor  = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const budget = await this.budgets.findById(cmd.budgetId);
    if (!budget) throw new NotFoundError("Presupuesto");
    if (budget.estado !== "borrador") throw new ConflictError("Solo se puede enviar un borrador");

    const updated = await this.budgets.update(budget.id, { estado: "enviado", fechaEnvio: new Date() });
    await this.events.emit({
      type: "BudgetSent", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor.id, actorName: actor.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
      budgetId: budget.id,
    });
    return updated;
  }
}

export class DeleteBudgetUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly budgets: IBudgetRepository,
  ) {}
  async execute(cmd: { actorId: number; budgetId: number }): Promise<void> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const budget = await this.budgets.findById(cmd.budgetId);
    if (!budget) throw new NotFoundError("Presupuesto");
    if (budget.estado === "firmado") throw new ConflictError("No se puede eliminar un presupuesto firmado");
    await this.budgets.delete(budget.id);
  }
}

export class ListBudgetsUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly budgets: IBudgetRepository,
  ) {}
  async execute(cmd: { actorId: number; proyectoId?: number | undefined }): Promise<Budget[]> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    // Admin: all budgets (optionally filtered by project)
    if (actor.rol === "admin") {
      if (cmd.proyectoId != null) return this.budgets.findByProject(cmd.proyectoId);
      // no findAll on the interface — leave that to admin dashboards via project filter
      return [];
    }
    // Cliente: only their own
    if (actor.rol === "cliente") return this.budgets.findByClient(actor.id);
    // Profesionales do not see budgets by default
    return [];
  }
}

export class RequestSignatureChallengeUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly budgets: IBudgetRepository,
    private readonly challenges: import("@reformapro/domain/repositories").IChallengeRepository,
    private readonly crypto: import("./sign-budget.use-case.js").ISignatureCrypto,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: { actorId: number; budgetId: number; ctx: ClientContext }): Promise<{ challenge: string; timestamp: number; exp: number }> {
    const actor  = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const budget = await this.budgets.findById(cmd.budgetId);
    if (!budget) throw new NotFoundError("Presupuesto");

    // Cliente must own, admin can assist
    if (actor.rol !== "admin" && budget.clienteId !== actor.id) throw new ForbiddenError();
    if (!budget.isSignable()) throw new ConflictError("El presupuesto no es firmable");

    // Reject if there's an unexpired challenge already
    const existing = await this.challenges.get(budget.id);
    if (existing) throw new ConflictError("Ya hay un proceso de firma activo");

    const timestamp = Date.now();
    const exp       = timestamp + 10 * 60 * 1000; // 10 min TTL
    const challenge = this.crypto.randomChallenge();
    await this.challenges.set(budget.id, { challenge, timestamp, exp, userId: budget.clienteId });

    await this.events.emit({
      type: "SignatureChallengeRequested", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor.id, actorName: actor.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
      budgetId: budget.id,
    });

    return { challenge, timestamp, exp };
  }
}
