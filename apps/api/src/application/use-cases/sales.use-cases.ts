import type { IChangeOrderRepository, IEstimateRepository, IOpportunityRepository, IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import type { Estimate, EstimateDraft, Opportunity, OpportunityStatus, Project, User } from "@reformapro/domain/entities";
import type { IEventEmitter } from "@reformapro/domain/events";
import { Money, Percentage } from "@reformapro/domain/value-objects";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@reformapro/domain/errors";
import type { ClientContext } from "./auth.use-cases.js";
import type { ISignatureCrypto } from "./sign-budget.use-case.js";

type OpportunityInput = Pick<Opportunity, "clienteId" | "nombre" | "email" | "telefono" | "direccion" | "tipo" | "descripcion" | "estado" | "fechaVisita" | "notasInternas">;
type PublicEstimateLine = Pick<EstimateDraft["partidas"][number], "id" | "categoria" | "descripcion" | "cantidad" | "unidad" | "precioVentaUnitario" | "descuento" | "iva" | "notaCliente">;
type PublicEstimateSnapshot = Pick<EstimateDraft, "titulo" | "referencia" | "validezDias" | "condicionesPago" | "garantia" | "notasCliente"> & { partidas: PublicEstimateLine[] };

function assertAdmin(user: User | null): asserts user is User { if (!user || user.rol !== "admin") throw new ForbiddenError(); }
function validateDraft(draft: EstimateDraft) {
  if (!draft.titulo?.trim()) throw new ValidationError("Título obligatorio", "titulo");
  if (!Array.isArray(draft.partidas) || !draft.partidas.length) throw new ValidationError("Añade al menos una partida", "partidas");
  if (!Number.isInteger(draft.validezDias) || draft.validezDias < 1 || draft.validezDias > 365) throw new ValidationError("Validez entre 1 y 365 días", "validezDias");
  draft.partidas.forEach((line, index) => { if (!line.descripcion?.trim() || line.cantidad <= 0 || line.precioVentaUnitario < 0 || line.iva < 0 || line.iva > 100) throw new ValidationError(`Partida ${index + 1} inválida`, "partidas"); });
}
function publicSnapshot(draft: EstimateDraft): PublicEstimateSnapshot { return { titulo: draft.titulo, ...(draft.referencia === undefined ? {} : { referencia: draft.referencia }), validezDias: draft.validezDias, condicionesPago: draft.condicionesPago, garantia: draft.garantia, notasCliente: draft.notasCliente, partidas: draft.partidas.map(({ id, categoria, descripcion, cantidad, unidad, precioVentaUnitario, descuento, iva, notaCliente }) => ({ id, categoria, descripcion, cantidad, unidad, precioVentaUnitario, descuento, iva, ...(notaCliente === undefined ? {} : { notaCliente }) })) }; }
function isExpired(enviadoAt: Date | null, validezDias: number, now = new Date()) { return !!enviadoAt && enviadoAt.getTime() + validezDias * 86_400_000 < now.getTime(); }
function validSignatureImage(value: string) { return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 700_000; }

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
  constructor(private readonly users: IUserRepository, private readonly opportunities: IOpportunityRepository, private readonly estimates: IEstimateRepository, private readonly projects: IProjectRepository, private readonly events: IEventEmitter, private readonly crypto: ISignatureCrypto) {}
  async list(actorId: number) { const actor = await this.users.findById(actorId); if (!actor) throw new ForbiddenError(); return actor.rol === "admin" ? this.estimates.findAll() : (await this.estimates.findAll()).filter(e => e.clienteId === actor.id); }
  async publicList(actorId: number) { const actor = await this.users.findById(actorId); if (!actor) throw new ForbiddenError(); const items = actor.rol === "admin" ? await this.estimates.findAll() : (await this.estimates.findAll()).filter(e => e.clienteId === actor.id); return Promise.all(items.map(item => this.publicView(item))); }
  async publicGet(actorId: number, id: number) { await this.get(actorId, id); return this.publicView(await this.require(id)); }
  async get(actorId: number, id: number) { const actor = await this.users.findById(actorId); if (!actor) throw new ForbiddenError(); const estimate = await this.require(id); if (actor.rol !== "admin" && estimate.clienteId !== actor.id) throw new ForbiddenError(); return estimate; }
  async create(actorId: number, opportunityId: number, draft: EstimateDraft, ctx: ClientContext) {
    const actor = await this.users.findById(actorId); assertAdmin(actor); validateDraft(draft);
    const opportunity = await this.opportunities.findById(opportunityId); if (!opportunity) throw new NotFoundError("Oportunidad");
    if (!opportunity.clienteId) throw new ConflictError("Vincula un cliente a la oportunidad antes de crear la propuesta");
    const now = new Date(); const number = `HOG-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;
    const saved = await this.estimates.save({ oportunidadId: opportunityId, clienteId: opportunity.clienteId, numero: number, titulo: draft.titulo.trim(), estado: "borrador", versionActual: 1, borrador: draft, motivoRechazo: null });
    await this.events.emit({ type: "EstimateCreated", eventId: crypto.randomUUID(), occurredAt: now, actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: saved.id, opportunityId }); return saved;
  }
  async update(actorId: number, id: number, draft: EstimateDraft) { assertAdmin(await this.users.findById(actorId)); const estimate = await this.require(id); if (estimate.estado !== "borrador" && estimate.estado !== "en_revision") throw new ConflictError("Crea una nueva versión para modificar una propuesta enviada"); validateDraft(draft); return this.estimates.update(id, { titulo: draft.titulo.trim(), borrador: draft }); }
  async send(actorId: number, id: number, ctx: ClientContext) { const actor = await this.users.findById(actorId); assertAdmin(actor); const estimate = await this.require(id); if (estimate.estado !== "borrador" && estimate.estado !== "en_revision") throw new ConflictError("Solo se puede enviar un borrador"); const sentAt = new Date(); const version = await this.estimates.saveVersion({ estimateId: id, version: estimate.versionActual, snapshot: publicSnapshot(estimate.borrador) as EstimateDraft, enviadoAt: sentAt, firmadoAt: null, firma: null }); const saved = await this.estimates.update(id, { estado: "enviado", motivoRechazo: null }); await this.events.emit({ type: "EstimateSent", eventId: crypto.randomUUID(), occurredAt: sentAt, actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: id, version: version.version }); return saved; }
  async versions(actorId: number, id: number) { await this.get(actorId, id); return this.estimates.findVersions(id); }
  async reject(actorId: number, id: number, motivo: string, ctx: ClientContext) { const actor = await this.users.findById(actorId); const estimate = await this.require(id); if (!actor || actor.rol !== "cliente" || actor.id !== estimate.clienteId) throw new ForbiddenError(); if (estimate.estado !== "enviado") throw new ConflictError("Solo se puede solicitar cambios en una propuesta pendiente"); const text = motivo.trim(); if (text.length < 10 || text.length > 2_000) throw new ValidationError("Explica los cambios solicitados (entre 10 y 2.000 caracteres)", "motivo"); const saved = await this.estimates.update(id, { estado: "rechazado", motivoRechazo: text }); await this.events.emit({ type: "EstimateRejected", eventId: crypto.randomUUID(), occurredAt: new Date(), actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: id, motivo: text }); return saved; }
  async createRevision(actorId: number, id: number) { assertAdmin(await this.users.findById(actorId)); const estimate = await this.require(id); if (!["enviado", "rechazado", "caducado"].includes(estimate.estado)) throw new ConflictError("Solo se puede revisar una propuesta enviada, rechazada o caducada"); return this.estimates.update(id, { estado: "en_revision", versionActual: estimate.versionActual + 1 }); }
  async sign(actorId: number, id: number, input: { password: string; canvasSignature: string; consentimiento: string }, ctx: ClientContext) {
    const actor = await this.users.findById(actorId); const estimate = await this.require(id);
    if (!actor || actor.rol !== "cliente" || actor.id !== estimate.clienteId) throw new ForbiddenError();
    if (estimate.estado !== "enviado") throw new ConflictError("La propuesta no está pendiente de firma");
    if (!input.password || !input.consentimiento?.trim() || !validSignatureImage(input.canvasSignature)) throw new ValidationError("La firma debe ser una imagen PNG válida de menos de 500 KB", "canvasSignature");
    const current = (await this.estimates.findVersions(id)).find(v => v.version === estimate.versionActual);
    if (!current || current.firmadoAt) throw new ConflictError("Esta versión no está disponible para firmar");
    if (isExpired(current.enviadoAt, current.snapshot.validezDias)) { await this.estimates.update(id, { estado: "caducado" }); throw new ConflictError("La validez de esta propuesta ha terminado. Solicita una revisión."); }
    const verified = await this.users.verifyPassword(actor.email.value, input.password); if (!verified || verified.id !== actor.id) throw new ForbiddenError("No se ha podido verificar tu identidad");
    const now = new Date(); const hash = await this.crypto.hashDocument(JSON.stringify({ estimateId: estimate.id, version: current.version, snapshot: current.snapshot })); const token = await this.crypto.generateSignatureToken(estimate.id, actor.id, now.getTime());
    const firma = { firmante: actor.nombre, email: actor.email.value, ip: ctx.ip, userAgent: ctx.userAgent, consentimiento: input.consentimiento.trim(), canvasSignature: input.canvasSignature, hash: hash.value, token, fechaFirma: now.toISOString() };
    await this.estimates.signVersion(id, current.version, firma, now); const saved = await this.estimates.update(id, { estado: "firmado" });
    await this.events.emit({ type: "EstimateSigned", eventId: crypto.randomUUID(), occurredAt: now, actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: id, hash: hash.value }); return { estimate: saved, hash: hash.value, fechaFirma: now };
  }
  async accept(actorId: number, id: number, ctx: ClientContext): Promise<Project> { const actor = await this.users.findById(actorId); assertAdmin(actor); const estimate = await this.require(id); if (estimate.estado !== "firmado") throw new ConflictError("Solo una propuesta firmada puede convertirse en proyecto"); const current = (await this.estimates.findVersions(id)).find(v => v.version === estimate.versionActual); if (!current?.firmadoAt) throw new ConflictError("Falta la firma de la versión vigente"); const opportunity = await this.opportunities.findById(estimate.oportunidadId); if (!opportunity) throw new NotFoundError("Oportunidad"); const subtotal = current.snapshot.partidas.reduce((sum, l) => sum + l.cantidad * l.precioVentaUnitario * (1 - l.descuento / 100), 0); const project: Project = { id: 0, estimateId: estimate.id, nombre: estimate.titulo, descripcion: opportunity.descripcion, clienteId: estimate.clienteId, direccion: opportunity.direccion, tipo: opportunity.tipo, estado: "planificacion", progreso: Percentage.zero(), presupuesto: Money.of(subtotal), fechaInicio: new Date(), fechaFinPrevista: new Date(), profesionalesAsignados: [], hitos: [], createdAt: new Date() }; const saved = await this.projects.save(project); await this.estimates.update(id, { estado: "aceptado" }); await this.opportunities.update(opportunity.id, { estado: "ganada" }); await this.events.emit({ type: "EstimateAccepted", eventId: crypto.randomUUID(), occurredAt: new Date(), actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent, estimateId: id, projectId: saved.id }); return saved; }
  private async require(id: number) { const estimate = await this.estimates.findById(id); if (!estimate) throw new NotFoundError("Presupuesto"); return estimate; }
  private async publicView(estimate: Estimate) {
    const version = (await this.estimates.findVersions(estimate.id)).find(v => v.version === estimate.versionActual) ?? null;
    const snapshot = version?.snapshot ? publicSnapshot(version.snapshot) : null;
    const subtotal = snapshot ? snapshot.partidas.reduce((sum, line) => sum + line.cantidad * line.precioVentaUnitario * (1 - line.descuento / 100), 0) : null;
    const iva = snapshot && subtotal != null ? snapshot.partidas.reduce((sum, line) => sum + line.cantidad * line.precioVentaUnitario * (1 - line.descuento / 100) * line.iva / 100, 0) : null;
    const expired = snapshot && version ? isExpired(version.enviadoAt, snapshot.validezDias) : false;
    return { id: estimate.id, numero: estimate.numero, titulo: estimate.titulo, estado: expired && estimate.estado === "enviado" ? "caducado" : estimate.estado, versionActual: estimate.versionActual, motivoRechazo: estimate.motivoRechazo, createdAt: estimate.createdAt, updatedAt: estimate.updatedAt, propuesta: snapshot ? { ...snapshot, totalSinIva: subtotal, totalIva: iva, totalConIva: subtotal! + iva!, enviadoAt: version!.enviadoAt, expiresAt: version!.enviadoAt ? new Date(version!.enviadoAt.getTime() + snapshot.validezDias * 86_400_000) : null, firmadoAt: version!.firmadoAt, hash: typeof version!.firma?.hash === "string" ? version!.firma.hash : null } : null };
  }
}

export class ChangeOrderUseCases {
  constructor(private readonly users: IUserRepository, private readonly projects: IProjectRepository, private readonly changes: IChangeOrderRepository) {}
  async list(actorId: number, projectId: number) { const actor = await this.users.findById(actorId); if (!actor) throw new ForbiddenError(); const project = await this.projects.findById(projectId); if (!project || (actor.rol !== "admin" && project.clienteId !== actor.id)) throw new ForbiddenError(); return this.changes.findByProject(projectId); }
  async create(actorId: number, projectId: number, payload: EstimateDraft) { assertAdmin(await this.users.findById(actorId)); if (!(await this.projects.findById(projectId))) throw new NotFoundError("Proyecto"); validateDraft(payload); const existing = await this.changes.findByProject(projectId); return this.changes.save({ projectId, numero: `OC-${String(existing.length + 1).padStart(3, "0")}`, estado: "borrador", payload, aprobadoAt: null }); }
}
