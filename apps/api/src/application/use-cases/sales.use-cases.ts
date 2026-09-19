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
import type { ISignatureCrypto } from "../../infrastructure/crypto/crypto.service.js";

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
  ): Promise<T>;
}
export class PassthroughCommercialTransaction
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
  return (
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) &&
    value.length <= 700_000
  );
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
  ) {}
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
    return this.opportunities.update(id, input);
  }
}

export class EstimateUseCases {
  private readonly transaction: ICommercialTransaction;
  private locked = false;
  constructor(
    private readonly users: IUserRepository,
    private readonly opportunities: IOpportunityRepository,
    private readonly estimates: IEstimateRepository,
    private readonly projects: IProjectRepository,
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
  async list(actorId: number) {
    const actor = await this.users.findById(actorId);
    if (!actor) throw new ForbiddenError();
    return actor.rol === "admin"
      ? this.estimates.findAll()
      : (await this.estimates.findAll()).filter(
          (e) => e.clienteId === actor.id,
        );
  }
  async publicList(actorId: number) {
    const actor = await this.users.findById(actorId);
    if (!actor) throw new ForbiddenError();
    const all = await this.estimates.findAll();
    // A proposal does not belong to the client portal until the business has
    // explicitly moved it beyond the internal draft state. This keeps titles,
    // numbers and workflow state of work-in-progress private as well.
    const items =
      actor.rol === "admin"
        ? all
        : all.filter(
            (estimate) =>
              estimate.clienteId === actor.id && !["borrador", "en_revision"].includes(estimate.estado),
          );
    return Promise.all(items.map((item) => this.publicView(item)));
  }
  async publicGet(actorId: number, id: number) {
    const actor = await this.users.findById(actorId);
    if (!actor) throw new ForbiddenError();
    const estimate = await this.get(actorId, id);
    // Do not turn a known numeric identifier into a way of inspecting a
    // proposal that has not been shared with its owner yet.
    if (actor.rol === "cliente" && ["borrador", "en_revision"].includes(estimate.estado))
      throw new NotFoundError("Presupuesto");
    return this.publicView(estimate);
  }
  async get(actorId: number, id: number) {
    const actor = await this.users.findById(actorId);
    if (!actor) throw new ForbiddenError();
    const estimate = await this.require(id);
    if (actor.rol !== "admin" && estimate.clienteId !== actor.id)
      throw new ForbiddenError();
    return estimate;
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
    const opportunity = await this.opportunities.findById(opportunityId);
    if (!opportunity) throw new NotFoundError("Oportunidad");
    if (!opportunity.clienteId)
      throw new ConflictError(
        "Vincula un cliente a la oportunidad antes de crear la propuesta",
      );
    const now = new Date();
    const number = `HOG-${now.getFullYear()}-${crypto.randomUUID()}`;
    const saved = await this.estimates.save({
      oportunidadId: opportunityId,
      clienteId: opportunity.clienteId,
      numero: number,
      titulo: draft.titulo.trim(),
      estado: "borrador",
      versionActual: 1,
      borrador: draft,
      motivoRechazo: null,
    });
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
  async versions(actorId: number, id: number) {
    await this.get(actorId, id);
    return this.estimates.findVersions(id);
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
        const opportunity = await opportunities.findById(
          estimate.oportunidadId,
        );
        if (!opportunity) throw new NotFoundError("Oportunidad");
        const subtotal = current.snapshot.partidas.reduce(
          (sum, line) =>
            sum +
            line.cantidad *
              line.precioVentaUnitario *
              (1 - line.descuento / 100),
          0,
        );
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
    return saved;
  }
  private async require(id: number) {
    const estimate = await this.estimates.findById(id);
    if (!estimate) throw new NotFoundError("Presupuesto");
    return estimate;
  }
  private async publicView(estimate: Estimate) {
    const version =
      (await this.estimates.findVersions(estimate.id)).find(
        (v) => v.version === estimate.versionActual,
      ) ?? null;
    const snapshot = version?.snapshot
      ? publicSnapshot(version.snapshot)
      : null;
    const subtotal = snapshot
      ? snapshot.partidas.reduce(
          (sum, line) =>
            sum +
            line.cantidad *
              line.precioVentaUnitario *
              (1 - line.descuento / 100),
          0,
        )
      : null;
    const iva =
      snapshot && subtotal != null
        ? snapshot.partidas.reduce(
            (sum, line) =>
              sum +
              (line.cantidad *
                line.precioVentaUnitario *
                (1 - line.descuento / 100) *
                line.iva) /
                100,
            0,
          )
        : null;
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
      versionActual: estimate.versionActual,
      motivoRechazo: estimate.motivoRechazo,
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
      propuesta: snapshot
        ? {
            ...snapshot,
            totalSinIva: subtotal,
            totalIva: iva,
            totalConIva: subtotal! + iva!,
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
}

export class ChangeOrderUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly changes: IChangeOrderRepository,
  ) {}
  async list(
    actorId: number,
    projectId: number,
  ): Promise<Array<ChangeOrder | PublicChangeOrder>> {
    const actor = await this.users.findById(actorId);
    if (!actor) throw new ForbiddenError();
    const project = await this.projects.findById(projectId);
    if (!project || (actor.rol !== "admin" && project.clienteId !== actor.id))
      throw new ForbiddenError();

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
    const existing = await this.changes.findByProject(projectId);
    return this.changes.save({
      projectId,
      numero: `OC-${String(existing.length + 1).padStart(3, "0")}`,
      estado: "borrador",
      payload,
      aprobadoAt: null,
    });
  }
}
