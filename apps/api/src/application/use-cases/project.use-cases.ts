/**
 * Project use cases.
 * Admin creates/edits/deletes; profesionales can only update progreso/hitos.
 */

import { IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import { IEventEmitter } from "@reformapro/domain/events";
import { Project, ProjectMilestone, ProjectProfessional } from "@reformapro/domain/entities";
import { Money, Percentage } from "@reformapro/domain/value-objects";
import { ValidationError, ForbiddenError, NotFoundError, ConflictError } from "@reformapro/domain/errors";
import { PermissionPolicy } from "@reformapro/domain/services";
import { ClientContext } from "./auth.use-cases.js";

export interface CreateProjectCommand {
  actorId: number;
  nombre: string;
  descripcion: string;
  clienteId: number;
  direccion: string;
  tipo: string;
  presupuesto: number;
  fechaInicio: string;       // ISO
  fechaFinPrevista: string;  // ISO
  hitos?: Array<{ id: string; nombre: string; completado: boolean; fecha: string }>;
  ctx: ClientContext;
}

export class CreateProjectUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: CreateProjectCommand): Promise<Project> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();

    throw new ConflictError("Los proyectos se crean al aceptar un presupuesto. Usa la conversión desde la propuesta.");

    const client = await this.users.findById(cmd.clienteId);
    if (!client || client?.rol !== "cliente") throw new ValidationError("Cliente inválido", "clienteId");
    if (!cmd.nombre?.trim()) throw new ValidationError("Nombre obligatorio", "nombre");

    const project: Project = {
      id: 0,
      estimateId: 0,
      nombre: cmd.nombre.trim(),
      descripcion: cmd.descripcion,
      clienteId: cmd.clienteId,
      direccion: cmd.direccion,
      tipo: cmd.tipo,
      estado: "planificacion",
      progreso: Percentage.zero(),
      presupuesto: Money.of(cmd.presupuesto),
      fechaInicio: new Date(cmd.fechaInicio),
      fechaFinPrevista: new Date(cmd.fechaFinPrevista),
      profesionalesAsignados: [],
      hitos: (cmd.hitos ?? []).map(h => ({ ...h, fecha: new Date(h.fecha) })),
      createdAt: new Date(),
    };

    const saved = await this.projects.save(project);
    await this.events.emit({
      type: "ProjectCreated", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor!.id, actorName: actor!.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
      projectId: saved.id,
    });
    return saved;
  }
}

export class UpdateProjectUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: {
    actorId: number;
    projectId: number;
    changes: Partial<Omit<Project, "id" | "createdAt" | "clienteId" | "profesionalesAsignados">>;
    ctx: ClientContext;
  }): Promise<Project> {
    const actor   = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");

    const built: Record<string, unknown> = {};

    if (actor.rol === "admin") {
      // Admin allowlist — clienteId and profesionalesAsignados are NEVER allowed via this endpoint
      // (use dedicated endpoints for reassigning client or managing professionals)
      const allowed: Array<keyof Project> = ["progreso", "estado", "nombre", "descripcion", "direccion", "tipo", "presupuesto", "fechaInicio", "fechaFinPrevista", "hitos"];
      for (const key of allowed) {
        const v = (cmd.changes as Record<string, unknown>)[key];
        if (v !== undefined) built[key] = v;
      }
    } else if (actor.rol === "profesional") {
      // Profesional: ONLY progreso and hitos, and only if policy allows
      const forbidden = Object.keys(cmd.changes).filter(k => k !== "progreso" && k !== "hitos");
      if (forbidden.length) throw new ForbiddenError(`No puedes editar: ${forbidden.join(", ")}`);
      if (cmd.changes.progreso !== undefined) {
        PermissionPolicy.authorize(actor, "project.update.progress", { project });
        built.progreso = cmd.changes.progreso;
      }
      if (cmd.changes.hitos !== undefined) {
        PermissionPolicy.authorize(actor, "project.update.milestones", { project });
        built.hitos = cmd.changes.hitos;
      }
    } else {
      throw new ForbiddenError();
    }

    const allowedChanges = built as Partial<Project>;

    const updated = await this.projects.update(cmd.projectId, allowedChanges);

    // Emit ProjectCompleted if we just transitioned to finalizado
    if (cmd.changes.estado === "finalizado" && project.estado !== "finalizado") {
      await this.events.emit({
        type: "ProjectCompleted", eventId: crypto.randomUUID(), occurredAt: new Date(),
        actorId: actor.id, actorName: actor.nombre,
        ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
        projectId: project.id,
      });
    }

    return updated;
  }
}

export class DeleteProjectUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
  ) {}
  async execute(cmd: { actorId: number; projectId: number }): Promise<void> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    // In production: cascade check — reject if there are signed budgets
    await this.projects.delete(cmd.projectId);
  }
}

export class GetProjectUseCase {
  constructor(private readonly users: IUserRepository, private readonly projects: IProjectRepository) {}
  async execute(cmd: { actorId: number; projectId: number }): Promise<Project> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    PermissionPolicy.authorize(actor, "project.read", { project });
    return project;
  }
}

export class AssignProjectProfessionalUseCase {
  constructor(private readonly users: IUserRepository, private readonly projects: IProjectRepository) {}
  async execute(cmd: { actorId: number; projectId: number; userId: number; profesion?: ProjectProfessional["profesion"] }): Promise<Project> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    const professional = await this.users.findById(cmd.userId);
    if (!professional || professional.rol !== "profesional" || !professional.activo) {
      throw new ValidationError("Profesional inválido", "userId");
    }
    if (project.profesionalesAsignados.some(p => p.userId === professional.id)) {
      throw new ValidationError("El profesional ya está asignado", "userId");
    }
    // The project assignment inherits the verified profession from the account.
    // Do not accept a client-controlled override that could grant mismatched access.
    if (!professional.profesion) throw new ValidationError("El profesional no tiene profesión configurada", "userId");
    const assignment: ProjectProfessional = { userId: professional.id, profesion: professional.profesion };
    return this.projects.update(project.id, { profesionalesAsignados: [...project.profesionalesAsignados, assignment] });
  }
}

export class UnassignProjectProfessionalUseCase {
  constructor(private readonly users: IUserRepository, private readonly projects: IProjectRepository) {}
  async execute(cmd: { actorId: number; projectId: number; userId: number }): Promise<Project> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    const remaining = project.profesionalesAsignados.filter(p => p.userId !== cmd.userId);
    if (remaining.length === project.profesionalesAsignados.length) throw new NotFoundError("Asignación");
    return this.projects.update(project.id, { profesionalesAsignados: remaining });
  }
}

export class ListProjectsUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
  ) {}
  async execute(cmd: { actorId: number }): Promise<Project[]> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor) throw new ForbiddenError();
    if (actor.rol === "admin")        return this.projects.findAll();
    if (actor.rol === "cliente")      return this.projects.findByClient(actor.id);
    if (actor.rol === "profesional")  return this.projects.findByProfesional(actor.id);
    return [];
  }
}
