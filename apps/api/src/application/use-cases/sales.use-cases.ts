import type {
  IChangeOrderRepository,
  IEstimateRepository,
  IOpportunityRepository,
  IProjectRepository,
  IUserRepository,
} from "@reformapro/domain/repositories";
import type {
  ChangeOrder,
  Estimate,
  EstimateDraft,
  EstimateVersion,
  Opportunity,
  OpportunityStatus,
  Project,
  User,
} from "@reformapro/domain/entities";
import type { DomainEvent, IEventEmitter } from "@reformapro/domain/events";
import { Money, Percentage } from "@reformapro/domain/value-objects";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@reformapro/domain/errors";
import { validateDraft } from "./estimate-validation.js";
import type { ClientContext } from "./auth.use-cases.js";
import type { ISolicitudRepository, ICooldownGate } from "./solicitud.use-cases.js";
import type { ISignatureCrypto } from "../../infrastructure/crypto/crypto.service.js";
import { calculateEstimateTotals } from "@reformapro/domain";

type OpportunityInput = Pick<
  Opportunity,
  | "clienteId"
  | "nombre"
  | "email"
  | "telefono"
  | "direccion"
  | "tipo"
  | "descripcion"
  | "estado"
  | "fechaVisita"
  | "notasInternas"
>;
type PublicEstimateLine = Pick<
  EstimateDraft["partidas"][number],
  | "id"
  | "categoria"
  | "descripcion"
  | "cantidad"
  | "unidad"
  | "precioVentaUnitario"
  | "descuento"
  | "iva"
  | "notaCliente"
>;
type PublicEstimateSnapshot = Pick<
  EstimateDraft,
  | "titulo"
  | "referencia"
  | "validezDias"
  | "condicionesPago"
  | "garantia"
  | "notasCliente"
> & { partidas: PublicEstimateLine[] };
export type PublicChangeOrder = {
  id: number;
  projectId: number;
  numero: string;
  estado: "enviado" | "aprobado" | "rechazado";
  propuesta: PublicEstimateSnapshot;
  aprobadoAt: Date | null;
  createdAt: Date;
};

export interface CommercialRepositories {
  users: IUserRepository;
  opportunities: IOpportunityRepository;
  estimates: IEstimateRepository;
  projects: IProjectRepository;
}
export interface ICommercialTransaction {
  execute<T>(
    operation: (repositories: CommercialRepositories) => Promise<T>,
    estimateId?: number,
    opportunityId?: number,
  ): Promise<T>;
}
class PassthroughCommercialTransaction
  implements ICommercialTransaction
{
  constructor(private readonly repositories: CommercialRepositories) {}
  private tail: Promise<unknown> = Promise.resolve();
  async execute<T>(
    operation: (repositories: CommercialRepositories) => Promise<T>,
  ) {
    const run = this.tail.then(() => operation(this.repositories));
    this.tail = run.catch(() => undefined);
    return run;
  }
}

function assertAdmin(user: User | null): asserts user is User {
  if (!user || user.rol !== "admin") throw new ForbiddenError();
}
const opportunityTransitions: Record<OpportunityStatus, OpportunityStatus[]> = {
  nueva: ["contactada", "en_estudio", "descartada"],
  contactada: ["visita_agendada", "en_estudio", "descartada"],
  visita_agendada: ["en_estudio", "descartada"],
  en_estudio: ["ganada", "descartada"],
  ganada: [],
  descartada: [],
};
function canTransitionOpportunity(from: OpportunityStatus, to: OpportunityStatus) {
  return from === to || opportunityTransitions[from].includes(to);
}
function isOpenOpportunity(status: OpportunityStatus) {
  return status !== "ganada" && status !== "descartada";
}
function publicSnapshot(draft: EstimateDraft): PublicEstimateSnapshot {
  return {
    titulo: draft.titulo,
    ...(draft.referencia === undefined ? {} : { referencia: draft.referencia }),
    validezDias: draft.validezDias,
    condicionesPago: draft.condicionesPago,
    garantia: draft.garantia,
    notasCliente: draft.notasCliente,
    partidas: draft.partidas.map(
      ({
        id,
        categoria,
        descripcion,
        cantidad,
        unidad,
        precioVentaUnitario,
        descuento,
        iva,
        notaCliente,
      }) => ({
        id,
        categoria,
        descripcion,
        cantidad,
        unidad,
        precioVentaUnitario,
        descuento,
        iva,
        ...(notaCliente === undefined ? {} : { notaCliente }),
      }),
    ),
  };
}
function isExpired(
  enviadoAt: Date | null,
  validezDias: number,
  now = new Date(),
) {
  return (
    !!enviadoAt &&
    enviadoAt.getTime() + validezDias * 86_400_000 < now.getTime()
  );
}
function validSignatureImage(value: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > 700_000) return false;
  try {
    const bytes = Uint8Array.from(atob(value.slice(value.indexOf(",") + 1)), char => char.charCodeAt(0));
    const png = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index) => bytes[index] === byte);
    if (!png || bytes.length < 33 || String.fromCharCode(...bytes.slice(12,16)) !== "IHDR") return false;
    const dimension = (offset: number) => ((bytes[offset]! << 24) | (bytes[offset+1]! << 16) | (bytes[offset+2]! << 8) | bytes[offset+3]!) >>> 0;
    const width = dimension(16), height = dimension(20);
    return width >= 100 && height >= 40 && width <= 4000 && height <= 2000;
  } catch { return false; }
}
function isClientVisibleChangeStatus(
  status: ChangeOrder["estado"],
): status is PublicChangeOrder["estado"] {
  return status !== "borrador";
}

export class OpportunityUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly opportunities: IOpportunityRepository,
    private readonly events: IEventEmitter,
    private readonly solicitudes?: ISolicitudRepository,
  ) {}
  async fromSolicitud(actorId: number, id: number, direccion: string) {
    assertAdmin(await this.users.findById(actorId));
    if (typeof direccion !== "string" || !direccion.trim()) throw new ValidationError("Dirección obligatoria", "direccion");
    const source = await this.solicitudes?.findById(id);
    if (!source) throw new NotFoundError("Solicitud");
    if (source.estado === "rechazado") throw new ConflictError("La solicitud está rechazada");
    return this.opportunities.fromSolicitud(id, { clienteId: null, nombre: source.nombre, email: source.email, telefono: source.telefono, direccion: direccion.trim(), tipo: source.tipo, descripcion: source.descripcion, estado: "nueva", fechaVisita: null, notasInternas: "" });
  }
  async list(actorId: number, estado?: OpportunityStatus) {
    assertAdmin(await this.users.findById(actorId));
    return this.opportunities.findAll(estado);
  }
  async create(actorId: number, input: OpportunityInput, ctx: ClientContext) {
    const actor = await this.users.findById(actorId);
    assertAdmin(actor);
    if (
      !input.nombre?.trim() ||
      !input.direccion?.trim() ||
      !input.tipo?.trim()
    )
      throw new ValidationError("Nombre, dirección y tipo son obligatorios");
    if (input.clienteId != null) {
      const client = await this.users.findById(input.clienteId);
      if (!client || client.rol !== "cliente")
        throw new ValidationError("Cliente no válido", "clienteId");
    }
    const saved = await this.opportunities.save({
      ...input,
      nombre: input.nombre.trim(),
      email: input.email?.trim() || null,
      telefono: input.telefono?.trim() || null,
      descripcion: input.descripcion ?? "",
      estado: input.estado ?? "nueva",
      fechaVisita: input.fechaVisita ?? null,
      notasInternas: input.notasInternas ?? "",
    });
    await this.events.emit({
      type: "OpportunityCreated",
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: actor.id,
      actorName: actor.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      opportunityId: saved.id,
    });
    return saved;
  }
  async update(actorId: number, id: number, input: Partial<OpportunityInput>) {
    assertAdmin(await this.users.findById(actorId));
    const current = await this.opportunities.findById(id);
    if (!current) throw new NotFoundError("Oportunidad");
    const allowed = new Set(["nombre", "clienteId", "email", "telefono", "direccion", "tipo", "descripcion", "estado", "fechaVisita", "notasInternas"]);
    if (Object.keys(input).some(key => !allowed.has(key))) throw new ValidationError("Campo de oportunidad no permitido");
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<OpportunityInput>;
    for (const field of ["nombre", "direccion", "tipo"] as const) {
      const value = changes[field];
      if (value !== undefined && (typeof value !== "string" || !value.trim())) throw new ValidationError("Campo obligatorio", field);
    }
    if (changes.clienteId !== undefined && changes.clienteId !== current.clienteId) {
      if (current.clienteId !== null) throw new ConflictError("No se puede cambiar el cliente de una oportunidad vinculada");
      if (changes.clienteId !== null) {
        const client = await this.users.findById(changes.clienteId);
        if (!client || client.rol !== "cliente") throw new ValidationError("Cliente no válido", "clienteId");
      }
    }
    if (changes.estado !== undefined && !["nueva", "contactada", "visita_agendada", "en_estudio", "ganada", "descartada"].includes(changes.estado)) throw new ValidationError("Estado no válido", "estado");
    if (changes.estado !== undefined && changes.estado !== current.estado) {
      if (!canTransitionOpportunity(current.estado, changes.estado)) throw new ConflictError("Transición comercial no permitida");
    }
    if (changes.fechaVisita !== undefined && changes.fechaVisita !== null && (!(changes.fechaVisita instanceof Date) || !Number.isFinite(changes.fechaVisita.getTime()))) throw new ValidationError("Fecha no válida", "fechaVisita");
    return this.opportunities.update(id, changes);
  }
}

export class EstimateUseCases {
  private readonly transaction: ICommercialTransaction;
  private locked = false;
  constructor(
    private readonly users: IUserRepository,
    private readonly opportunities: IOpportunityRepository,
    private readonly estimates: IEstimateRepository,
    projects: IProjectRepository,
    private readonly events: IEventEmitter,
    private readonly crypto: ISignatureCrypto,
    transaction?: ICommercialTransaction,
  ) {
    this.transaction =
      transaction ??
      new PassthroughCommercialTransaction({
        users,
        opportunities,
        estimates,
        projects,
      });
  }
  private async mutate<T>(
    id: number,
    operation: (service: EstimateUseCases) => Promise<T>,
  ): Promise<T> {
    const events: DomainEvent[] = [];
    const result = await this.transaction.execute(async (repositories) => {
      const buffered: IEventEmitter = {
        emit: async (event) => {
          events.push(event);
        },
        subscribe: () => () => undefined,
      };
      const service = new EstimateUseCases(
        repositories.users,
        repositories.opportunities,
        repositories.estimates,
        repositories.projects,
        buffered,
        this.crypto,
        new PassthroughCommercialTransaction(repositories),
      );
      service.locked = true;
      return operation(service);
    }, id);
    for (const event of events) await this.events.emit(event);
    return result;
  }
  async publicList(actorId: number, query: { page?: number; search?: string; status?: string } = {}) {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    if (!["admin", "cliente"].includes(actor.rol)) throw new ForbiddenError();
    const page = query.page ?? 0;
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new ValidationError("Página no válida");
    const requestedStatus = query.status ?? "";
    const repositoryStatus = actor.rol === "cliente" && requestedStatus === "actualizando"
      ? "en_revision"
      : requestedStatus;
    const all = await this.estimates.findPage({ ...(actor.rol === "cliente" ? { clientId: actor.id } : {}), page, limit: 20, search: (query.search ?? "").trim().slice(0,200), status: repositoryStatus });
    // A proposal does not belong to the client portal until the business has
    // explicitly moved it beyond the internal draft state. This keeps titles,
    // numbers and workflow state of work-in-progress private as well.
    const items =
      actor.rol === "admin"
        ? all
        : all.filter(
            (estimate) =>
              estimate.clienteId === actor.id && estimate.estado !== "borrador",
          );
    return Promise.all(items.map((item) => this.clientVisibleView(actor, item)));
  }
  async publicGet(actorId: number, id: number) {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    const estimate = await this.get(actorId, id);
    // Do not turn a known numeric identifier into a way of inspecting a
    // proposal that has not been shared with its owner yet.
    if (actor.rol === "cliente" && estimate.estado === "borrador")
      throw new NotFoundError("Presupuesto");
    return this.clientVisibleView(actor, estimate);
  }
  private async clientVisibleView(actor: User, estimate: Estimate) {
    if (actor.rol === "cliente" && estimate.estado === "en_revision") {
      const published = (await this.estimates.findVersions(estimate.id)).filter(item => item.enviadoAt).sort((a,b) => b.version-a.version)[0];
      if (!published) throw new NotFoundError("Presupuesto");
      const visible = await this.publicView({ ...estimate, titulo: published.snapshot.titulo, motivoRechazo: null }, published);
      return { ...visible, estado: "actualizando" };
    }
    return this.publicView(estimate);
  }
  async get(actorId: number, id: number) {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    const estimate = await this.require(id);
    if (actor.rol !== "admin" && estimate.clienteId !== actor.id)
      throw new NotFoundError("Presupuesto");
    return estimate;
  }
  async adminDraft(actorId: number, id: number) {
    assertAdmin(await this.users.findById(actorId));
    return this.require(id);
  }
  async create(
    actorId: number,
    opportunityId: number,
    draft: EstimateDraft,
    ctx: ClientContext,
  ) {
    const actor = await this.users.findById(actorId);
    assertAdmin(actor);
    validateDraft(draft);
    const now = new Date();
    const number = `HOG-${now.getFullYear()}-${crypto.randomUUID()}`;
    const saved = await this.transaction.execute(async ({ opportunities, estimates }) => {
      const opportunity = await opportunities.findById(opportunityId);
      if (!opportunity) throw new NotFoundError("Oportunidad");
      if (!opportunity.clienteId)
        throw new ConflictError(
          "Vincula un cliente a la oportunidad antes de crear la propuesta",
        );
      if (!canTransitionOpportunity(opportunity.estado, "en_estudio"))
        throw new ConflictError("La oportunidad está cerrada y no admite nuevas propuestas");
      const created = await estimates.save({
        oportunidadId: opportunityId,
        clienteId: opportunity.clienteId,
        numero: number,
        titulo: draft.titulo.trim(),
        estado: "borrador",
        versionActual: 1,
        borrador: draft,
        motivoRechazo: null,
      });
      if (opportunity.estado !== "en_estudio")
        await opportunities.update(opportunity.id, { estado: "en_estudio" });
      return created;
    }, undefined, opportunityId);
    await this.events.emit({
      type: "EstimateCreated",
      eventId: crypto.randomUUID(),
      occurredAt: now,
      actorId: actor.id,
      actorName: actor.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      estimateId: saved.id,
      opportunityId,
    });
    return saved;
  }
  async update(
    actorId: number,
    id: number,
    draft: EstimateDraft,
  ): Promise<Estimate> {
    if (!this.locked)
      return this.mutate(id, (service) => service.update(actorId, id, draft));
    assertAdmin(await this.users.findById(actorId));
    const estimate = await this.require(id);
    if (estimate.estado !== "borrador" && estimate.estado !== "en_revision")
      throw new ConflictError(
        "Crea una nueva versión para modificar una propuesta enviada",
      );
    validateDraft(draft);
    return this.estimates.update(id, {
      titulo: draft.titulo.trim(),
      borrador: draft,
    });
  }
  async send(
    actorId: number,
    id: number,
    ctx: ClientContext,
  ): Promise<Estimate> {
    if (!this.locked)
      return this.mutate(id, (service) => service.send(actorId, id, ctx));
    const actor = await this.users.findById(actorId);
    assertAdmin(actor);
    const estimate = await this.require(id);
    if (estimate.estado !== "borrador" && estimate.estado !== "en_revision")
      throw new ConflictError("Solo se puede enviar un borrador");
    validateDraft(estimate.borrador);
    const sentAt = new Date();
    const version = await this.estimates.saveVersion({
      estimateId: id,
      version: estimate.versionActual,
      snapshot: publicSnapshot(estimate.borrador) as EstimateDraft,
      enviadoAt: sentAt,
      firmadoAt: null,
      firma: null,
    });
    const saved = await this.estimates.update(id, {
      estado: "enviado",
      motivoRechazo: null,
    });
    await this.events.emit({
      type: "EstimateSent",
      eventId: crypto.randomUUID(),
      occurredAt: sentAt,
      actorId: actor.id,
      actorName: actor.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      estimateId: id,
      version: version.version,
    });
    return saved;
  }
  async history(actorId: number, id: number) {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo || !["admin", "cliente"].includes(actor.rol)) throw new ForbiddenError();
    const estimate = await this.get(actorId, id);
    if (actor.rol === "cliente" && estimate.estado === "borrador") throw new NotFoundError("Presupuesto");
    const versions = (await this.estimates.findVersions(id)).filter(version => version.enviadoAt !== null);
    return Promise.all(versions.map(version => this.publicView({ ...estimate, titulo: version.snapshot.titulo, motivoRechazo: version.version === estimate.versionActual ? estimate.motivoRechazo : null, estado: version.version === estimate.versionActual ? estimate.estado : "sustituido" }, version)));
  }
  async publicVersion(actorId: number, id: number, number: number) {
    const history = await this.history(actorId, id);
    const version = history.find(item => item.versionActual === number);
    if (!version) throw new NotFoundError("Versión publicada");
    return version;
  }
  async reject(
    actorId: number,
    id: number,
    motivo: string,
    ctx: ClientContext,
  ): Promise<Estimate> {
    if (!this.locked)
      return this.mutate(id, (service) =>
        service.reject(actorId, id, motivo, ctx),
      );
    const actor = await this.users.findById(actorId);
    const estimate = await this.require(id);
    if (!actor || actor.rol !== "cliente" || actor.id !== estimate.clienteId)
      throw new ForbiddenError();
    if (estimate.estado !== "enviado")
      throw new ConflictError(
        "Solo se puede solicitar cambios en una propuesta pendiente",
      );
    const text = typeof motivo === "string" ? motivo.trim() : "";
    if (text.length < 10 || text.length > 2_000)
      throw new ValidationError(
        "Explica los cambios solicitados (entre 10 y 2.000 caracteres)",
        "motivo",
      );
    const saved = await this.estimates.update(id, {
      estado: "rechazado",
      motivoRechazo: text,
    });
    await this.events.emit({
      type: "EstimateRejected",
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: actor.id,
      actorName: actor.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      estimateId: id,
      motivo: text,
    });
    return saved;
  }
  async createRevision(actorId: number, id: number): Promise<Estimate> {
    if (!this.locked)
      return this.mutate(id, (service) => service.createRevision(actorId, id));
    assertAdmin(await this.users.findById(actorId));
    const estimate = await this.require(id);
    if (!["enviado", "rechazado", "caducado"].includes(estimate.estado))
      throw new ConflictError(
        "Solo se puede revisar una propuesta enviada, rechazada o caducada",
      );
    return this.estimates.update(id, {
      estado: "en_revision",
      versionActual: estimate.versionActual + 1,
    });
  }
  async sign(
    actorId: number,
    id: number,
    input: {
      password: string;
      canvasSignature: string;
      consentimiento: string;
      version?: number;
    },
    ctx: ClientContext,
  ): Promise<{ estimate: Estimate; hash: string; fechaFirma: Date }> {
    if (!this.locked)
      return this.mutate(id, (service) =>
        service.sign(actorId, id, input, ctx),
      );
    const actor = await this.users.findById(actorId);
    const estimate = await this.require(id);
    if (!actor || actor.rol !== "cliente" || actor.id !== estimate.clienteId)
      throw new ForbiddenError();
    if (estimate.estado !== "enviado")
      throw new ConflictError("La propuesta no está pendiente de firma");
    const opportunity = await this.opportunities.findById(estimate.oportunidadId);
    if (!opportunity) throw new NotFoundError("Oportunidad");
    if (!isOpenOpportunity(opportunity.estado))
      throw new ConflictError("La oportunidad ya no está abierta para aceptación");
    if (!input || input.version !== estimate.versionActual)
      throw new ConflictError(
        "La versión ha cambiado. Vuelve a abrir el presupuesto antes de firmar.",
      );
    if (
      typeof input.password !== "string" ||
      !input.password ||
      input.password.length > 200 ||
      typeof input.consentimiento !== "string" ||
      !input.consentimiento.trim() ||
      input.consentimiento.length > 4000 ||
      !validSignatureImage(input.canvasSignature)
    )
      throw new ValidationError(
        "La firma debe ser una imagen PNG válida de menos de 500 KB",
        "canvasSignature",
      );
    const current = (await this.estimates.findVersions(id)).find(
      (v) => v.version === estimate.versionActual,
    );
    if (!current || current.firmadoAt)
      throw new ConflictError("Esta versión no está disponible para firmar");
    if (isExpired(current.enviadoAt, current.snapshot.validezDias)) {
      throw new ConflictError(
        "La validez de esta propuesta ha terminado. Solicita una revisión.",
      );
    }
    const verified = await this.users.verifyPassword(
      actor.email.value,
      input.password,
    );
    if (!verified || verified.id !== actor.id)
      throw new ForbiddenError("No se ha podido verificar tu identidad");
    const now = new Date();
    const hash = await this.crypto.hashDocument(
      JSON.stringify({
        estimateId: estimate.id,
        version: current.version,
        snapshot: current.snapshot,
      }),
    );
    const token = await this.crypto.generateSignatureToken(
      estimate.id,
      actor.id,
      now.getTime(),
      hash.value,
    );
    const firma = {
      firmante: actor.nombre,
      email: actor.email.value,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      consentimiento: input.consentimiento.trim(),
      canvasSignature: input.canvasSignature,
      hash: hash.value,
      token,
      fechaFirma: now.toISOString(),
    };
    await this.estimates.signVersion(id, current.version, firma, now);
    const saved = await this.estimates.update(id, { estado: "firmado" });
    await this.events.emit({
      type: "EstimateSigned",
      eventId: crypto.randomUUID(),
      occurredAt: now,
      actorId: actor.id,
      actorName: actor.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      estimateId: id,
      hash: hash.value,
    });
    return { estimate: saved, hash: hash.value, fechaFirma: now };
  }
  async accept(
    actorId: number,
    id: number,
    ctx: ClientContext,
  ): Promise<Project> {
    if (!this.locked)
      return this.mutate(id, (service) => service.accept(actorId, id, ctx));
    const actor = await this.users.findById(actorId);
    assertAdmin(actor);
    const saved = await this.transaction.execute(
      async ({ estimates, opportunities, projects }) => {
        const estimate = await estimates.findById(id);
        if (!estimate) throw new NotFoundError("Presupuesto");
        if (estimate.estado !== "firmado")
          throw new ConflictError(
            "Solo una propuesta firmada puede convertirse en proyecto",
          );
        const current = (await estimates.findVersions(id)).find(
          (version) => version.version === estimate.versionActual,
        );
        if (!current?.firmadoAt)
          throw new ConflictError("Falta la firma de la versión vigente");
        await this.verifySignedVersionIntegrity(estimate, current);
        const opportunity = await opportunities.findById(
          estimate.oportunidadId,
        );
        if (!opportunity) throw new NotFoundError("Oportunidad");
        if (!isOpenOpportunity(opportunity.estado))
          throw new ConflictError("La oportunidad ya no está abierta para conversión");
        const subtotal = calculateEstimateTotals(current.snapshot.partidas).totalSinIva;
        const project: Project = {
          id: 0,
          estimateId: estimate.id,
          nombre: estimate.titulo,
          descripcion: opportunity.descripcion,
          clienteId: estimate.clienteId,
          direccion: opportunity.direccion,
          tipo: opportunity.tipo,
          estado: "planificacion",
          progreso: Percentage.zero(),
          presupuesto: Money.of(subtotal),
          fechaInicio: new Date(),
          fechaFinPrevista: new Date(),
          profesionalesAsignados: [],
          hitos: [],
          createdAt: new Date(),
        };
        const created = await projects.save(project);
        await estimates.update(id, { estado: "aceptado" });
        if (opportunity.estado !== "en_estudio")
          await opportunities.update(opportunity.id, { estado: "en_estudio" });
        await opportunities.update(opportunity.id, { estado: "ganada" });
        return created;
      },
    );
    await this.events.emit({
      type: "EstimateAccepted",
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: actor.id,
      actorName: actor.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      estimateId: id,
      projectId: saved.id,
    });
    await this.events.emit({
      type: "ProjectCreated", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor.id, actorName: actor.nombre, ip: ctx.ip, userAgent: ctx.userAgent,
      projectId: saved.id, estimateId: id,
    });
    return saved;
  }
  private async require(id: number) {
    const estimate = await this.estimates.findById(id);
    if (!estimate) throw new NotFoundError("Presupuesto");
    return estimate;
  }
  private async publicView(estimate: Estimate, selectedVersion?: EstimateVersion) {
    const version = selectedVersion ??
      (await this.estimates.findVersions(estimate.id)).find(
        (v) => v.version === estimate.versionActual,
      ) ?? null;
    if (version?.firma) await this.verifySignedVersionIntegrity(estimate, version);
    const snapshot = version?.snapshot
      ? publicSnapshot(version.snapshot)
      : null;
    const totals = snapshot ? calculateEstimateTotals(snapshot.partidas) : null;
    const expired =
      snapshot && version
        ? isExpired(version.enviadoAt, snapshot.validezDias)
        : false;
    return {
      id: estimate.id,
      numero: estimate.numero,
      titulo: estimate.titulo,
      estado:
        expired && estimate.estado === "enviado" ? "caducado" : estimate.estado,
      versionActual: version?.version ?? estimate.versionActual,
      motivoRechazo: estimate.motivoRechazo,
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
      propuesta: snapshot
        ? {
            ...snapshot,
            ...totals!,
            enviadoAt: version!.enviadoAt,
            expiresAt: version!.enviadoAt
              ? new Date(
                  version!.enviadoAt.getTime() +
                    snapshot.validezDias * 86_400_000,
                )
              : null,
            firmadoAt: version!.firmadoAt,
            hash:
              typeof version!.firma?.hash === "string"
                ? version!.firma.hash
                : null,
          }
        : null,
    };
  }
  private async verifySignedVersionIntegrity(estimate: Estimate, version: EstimateVersion) {
    const token = typeof version.firma?.token === "string" ? version.firma.token : "";
    const storedHash = typeof version.firma?.hash === "string" ? version.firma.hash : "";
    const signedAt = typeof version.firma?.fechaFirma === "string" ? Date.parse(version.firma.fechaFirma) : NaN;
    const currentHash = await this.crypto.hashDocument(JSON.stringify({ estimateId: estimate.id, version: version.version, snapshot: version.snapshot }));
    if (!token || !storedHash || currentHash.value !== storedHash || !Number.isFinite(signedAt) || !(await this.crypto.verifySignatureToken(token, estimate.id, estimate.clienteId, signedAt, storedHash))) throw new ConflictError("No se ha podido verificar la integridad de la firma");
  }
}

export class ChangeOrderUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly changes: IChangeOrderRepository,
    private readonly gate?: ICooldownGate,
  ) {}
  async edit(actorId: number, projectId: number, id: number, payload: EstimateDraft) {
    assertAdmin(await this.users.findById(actorId));
    validateDraft(payload);
    const order = (await this.changes.findByProject(projectId)).find(item => item.id === id);
    if (!order) throw new NotFoundError("Orden de cambio");
    if (order.estado !== "borrador") throw new ConflictError("Una orden publicada no se puede modificar");
    return this.changes.update(id, { payload });
  }
  async transition(actorId: number, projectId: number, id: number, next: string, password?: string) {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError("Proyecto");
    const order = (await this.changes.findByProject(projectId)).find(item => item.id === id);
    if (!order) throw new NotFoundError("Orden de cambio");
    if (next === "enviado") {
      assertAdmin(actor);
      validateDraft(order.payload);
      return this.changes.transition(id, projectId, "borrador", "enviado", actor.id);
    }
    if (!["aprobado", "rechazado"].includes(next)) throw new ValidationError("Acción no válida");
    if (actor.rol !== "cliente" || project.clienteId !== actor.id) throw new ForbiddenError();
    if (this.gate && !(await this.gate.check(`change-decision:${actorId}`, 5, 60000))) throw new ForbiddenError("Espera un minuto antes de volver a intentarlo");
    if (typeof password !== "string" || password.length > 72 || !(await this.users.verifyPassword(actor.email.value, password))) throw new ForbiddenError("Confirma tu contraseña para registrar la decisión");
    await this.changes.transition(id, projectId, "enviado", next as "aprobado" | "rechazado", actor.id);
    return (await this.list(actorId, projectId)).find(item => item.id === id)!;
  }
  async list(
    actorId: number,
    projectId: number,
  ): Promise<Array<ChangeOrder | PublicChangeOrder>> {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    const project = await this.projects.findById(projectId);
    if (!project || (actor.rol !== "admin" && project.clienteId !== actor.id))
      throw new NotFoundError("Proyecto");

    const orders = await this.changes.findByProject(projectId);
    if (actor.rol === "admin") return orders;

    // Change orders follow the same boundary as estimates: a client receives
    // only an explicitly sent decision and never the internal draft payload.
    const visibleOrders = orders.filter(
      (order): order is ChangeOrder & { estado: PublicChangeOrder["estado"] } =>
        isClientVisibleChangeStatus(order.estado),
    );
    return visibleOrders.map((order) => ({
      id: order.id,
      projectId: order.projectId,
      numero: order.numero,
      estado: order.estado,
      propuesta: publicSnapshot(order.payload),
      aprobadoAt: order.aprobadoAt,
      createdAt: order.createdAt,
    }));
  }
  async create(actorId: number, projectId: number, payload: EstimateDraft) {
    assertAdmin(await this.users.findById(actorId));
    if (!(await this.projects.findById(projectId)))
      throw new NotFoundError("Proyecto");
    validateDraft(payload);
    return this.changes.save({
      projectId,
      numero: `OC-${crypto.randomUUID()}`,
      estado: "borrador",
      payload,
      aprobadoAt: null,
    });
  }
}
