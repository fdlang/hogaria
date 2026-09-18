import type { IChangeOrderRepository, IEstimateRepository, IOpportunityRepository, IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import type { ChangeOrder, Estimate, EstimateDraft, Opportunity, OpportunityStatus, Project, User } from "@reformapro/domain/entities";
import type { IEventEmitter } from "@reformapro/domain/events";
import { Email, Money, Percentage } from "@reformapro/domain/value-objects";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@reformapro/domain/errors";
import type { ClientContext } from "./auth.use-cases.js";

type OpportunityInput = Pick<Opportunity, "clienteId" | "nombre" | "email" | "telefono" | "direccion" | "tipo" | "descripcion" | "estado" | "fechaVisita" | "notasInternas">;

function assertAdmin(user: User | null): asserts user is User {
  if (!user || user.rol !== "admin") throw new ForbiddenError();
}

function validateDraft(draft: EstimateDraft) {
  if (!draft.titulo?.trim()) throw new ValidationError("Título obligatorio", "titulo");
  if (!Array.isArray(draft.partidas) || !draft.partidas.length) throw new ValidationError("Añade al menos una partida", "partidas");
  if (!Number.isInteger(draft.validezDias) || draft.validezDias < 1 || draft.validezDias > 365) throw new ValidationError("Validez entre 1 y 365 días", "validezDias");
  draft.partidas.forEach((line, index) => {
    if (!line.descripcion?.trim() || line.cantidad <= 0 || line.precioVentaUnitario < 0 || line.iva < 0) throw new ValidationError(`Partida ${index + 1} inválida`, "partidas");
  });
}

function publicSnapshot(draft: EstimateDraft): EstimateDraft {
  return { ...draft, notasInternas: "", partidas: draft.partidas.map(({ costeUnitario: _cost, notaInterna: _note, ...line }) => ({ ...line, costeUnitario: null })) };
}

export class OpportunityUseCases {
  constructor(private readonly users: IUserRepository, private readonly opportunities: IOpportunityRepository, private readonly events: IEventEmitter) {}
  async list(actorId: number, estado?: OpportunityStatus) { assertAdmin(await this.users.findById(actorId)); return this.opportunities.findAll(estado); }
  async create(actorId: number, input: OpportunityInput, ctx: ClientContext) {
    const actor = await this.users.findById(actorId); assertAdmin(actor);
    if (!input.nombre?.trim() || !input.direccion?.trim() || !input.tipo?.trim()) throw new ValidationError("Nombre, dirección y tipo son obligatorios");
    if (input.clienteId != null) { const client = await this.users.findById(input.clienteId); if (!client || client.rol !== "cliente") throw new ValidationError("Cliente no válido", "clienteId"); }
    const saved = await this.opportunities.save({ ...input, nombre: input.nombre.trim(), email: input.email?.trim() || null, telefono: input.telefono?.trim() || null, descripcion: input.descripcion ?? "", estado: input.estado ?? "nueva", fechaVisita: input.fechaVisita ?? null, notasInternas: input.notasInternas ?? "" });
    await this.events.emit({ type: "OpportunityCreated", eventId: crypto.randomUUID(), occurredAt: new Date(), actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, opportunityId: saved.id });
    return saved;
  }
  async update(actorId: number, id: number, input: Partial<OpportunityInput>) { assertAdmin(await this.users.findById(actorId)); return this.opportunities.update(id, input); }
}

export class EstimateUseCases {
  constructor(private readonly users: IUserRepository, private readonly opportunities: IOpportunityRepository, private readonly estimates: IEstimateRepository, private readonly projects: IProjectRepository, private readonly events: IEventEmitter) {}
  async list(actorId: number) { const actor = await this.users.findById(actorId); if (!actor) throw new ForbiddenError(); if (actor.rol === "admin") return this.estimates.findAll(); return (await this.estimates.findAll()).filter(e => e.clienteId === actor.id); }
  async get(actorId: number, id: number) { const actor = await this.users.findById(actorId); if (!actor) throw new ForbiddenError(); const estimate = await this.require(id); if (actor.rol !== "admin" && estimate.clienteId !== actor.id) throw new ForbiddenError(); return estimate; }
  async create(actorId: number, opportunityId: number, draft: EstimateDraft, ctx: ClientContext) {
    const actor = await this.users.findById(actorId); assertAdmin(actor); validateDraft(draft);
    const opportunity = await this.opportunities.findById(opportunityId); if (!opportunity) throw new NotFoundError("Oportunidad");
    if (!opportunity.clienteId) throw new ConflictError("Vincula un cliente a la oportunidad antes de crear la propuesta");
    const now = new Date(); const number = `HOG-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;
    const saved = await this.estimates.save({ oportunidadId: opportunityId, clienteId: opportunity.clienteId, numero: number, titulo: draft.titulo.trim(), estado: "borrador", versionActual: 1, borrador: draft });
    await this.events.emit({ type: "EstimateCreated", eventId: crypto.randomUUID(), occurredAt: now, actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: saved.id, opportunityId });
    return saved;
  }
  async update(actorId: number, id: number, draft: EstimateDraft) { assertAdmin(await this.users.findById(actorId)); const estimate = await this.require(id); if (estimate.estado !== "borrador" && estimate.estado !== "en_revision") throw new ConflictError("Crea una nueva versión para modificar una propuesta enviada"); validateDraft(draft); return this.estimates.update(id, { titulo: draft.titulo.trim(), borrador: draft }); }
  async send(actorId: number, id: number, ctx: ClientContext) { const actor = await this.users.findById(actorId); assertAdmin(actor); const estimate = await this.require(id); if (estimate.estado !== "borrador" && estimate.estado !== "en_revision") throw new ConflictError("Solo se puede enviar un borrador"); const version = await this.estimates.saveVersion({ estimateId: id, version: estimate.versionActual, snapshot: publicSnapshot(estimate.borrador), enviadoAt: new Date(), firmadoAt: null, firma: null }); const saved = await this.estimates.update(id, { estado: "enviado" }); await this.events.emit({ type: "EstimateSent", eventId: crypto.randomUUID(), occurredAt: new Date(), actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: id, version: version.version }); return saved; }
  async versions(actorId: number, id: number) { await this.get(actorId, id); return this.estimates.findVersions(id); }
  async createRevision(actorId: number, id: number) { assertAdmin(await this.users.findById(actorId)); const estimate = await this.require(id); if (estimate.estado !== "enviado" && estimate.estado !== "rechazado") throw new ConflictError("Solo se puede revisar una propuesta enviada o rechazada"); return this.estimates.update(id, { estado: "en_revision", versionActual: estimate.versionActual + 1 }); }
  async accept(actorId: number, id: number, ctx: ClientContext): Promise<Project> { const actor = await this.users.findById(actorId); const estimate = await this.require(id); if (!actor || (actor.rol !== "admin" && actor.id !== estimate.clienteId)) throw new ForbiddenError(); if (estimate.estado !== "enviado") throw new ConflictError("La propuesta no está pendiente de aceptación"); const versions = await this.estimates.findVersions(id); const current = versions.find(v => v.version === estimate.versionActual); if (!current) throw new ConflictError("No existe una versión enviada para aceptar"); const opportunity = await this.opportunities.findById(estimate.oportunidadId); if (!opportunity) throw new NotFoundError("Oportunidad"); const subtotal = current.snapshot.partidas.reduce((sum, l) => sum + l.cantidad * l.precioVentaUnitario * (1 - l.descuento / 100), 0); const project: Project = { id: 0, estimateId: estimate.id, nombre: estimate.titulo, descripcion: opportunity.descripcion, clienteId: estimate.clienteId, direccion: opportunity.direccion, tipo: opportunity.tipo, estado: "planificacion", progreso: Percentage.zero(), presupuesto: Money.of(subtotal), fechaInicio: new Date(), fechaFinPrevista: new Date(), profesionalesAsignados: [], hitos: [], createdAt: new Date() }; const saved = await this.projects.save(project); await this.estimates.update(id, { estado: "aceptado" }); await this.opportunities.update(opportunity.id, { estado: "ganada" }); await this.events.emit({ type: "EstimateAccepted", eventId: crypto.randomUUID(), occurredAt: new Date(), actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: id, projectId: saved.id }); return saved; }
  private async require(id: number) { const estimate = await this.estimates.findById(id); if (!estimate) throw new NotFoundError("Presupuesto"); return estimate; }
}

export class ChangeOrderUseCases {
  constructor(private readonly users: IUserRepository, private readonly projects: IProjectRepository, private readonly changes: IChangeOrderRepository) {}
  async list(actorId: number, projectId: number) { const actor = await this.users.findById(actorId); if (!actor) throw new ForbiddenError(); const project = await this.projects.findById(projectId); if (!project || (actor.rol !== "admin" && project.clienteId !== actor.id)) throw new ForbiddenError(); return this.changes.findByProject(projectId); }
  async create(actorId: number, projectId: number, payload: EstimateDraft) { assertAdmin(await this.users.findById(actorId)); if (!(await this.projects.findById(projectId))) throw new NotFoundError("Proyecto"); validateDraft(payload); const existing = await this.changes.findByProject(projectId); return this.changes.save({ projectId, numero: `OC-${String(existing.length + 1).padStart(3, "0")}`, estado: "borrador", payload, aprobadoAt: null }); }
}
