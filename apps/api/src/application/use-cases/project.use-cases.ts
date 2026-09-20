/**
 * Project use cases.
 * Projects originate from signed estimates and retain their commercial history.
 * Admin edits them; profesionales can only update progreso/hitos.
 */

import { IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import { IEventEmitter } from "@reformapro/domain/events";
import { Project, ProjectProfessional } from "@reformapro/domain/entities";
import { ValidationError, ForbiddenError, NotFoundError, ConflictError } from "@reformapro/domain/errors";
import { PermissionPolicy } from "@reformapro/domain/services";
import { ClientContext } from "./auth.use-cases.js";
import { projectChanges } from "./project-validation.js";

// Direct creation is intentionally absent: projects originate from signed estimates.

export class UpdateProjectUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: {
    actorId: number;
    projectId: number;
    changes: unknown;
    ctx: ClientContext;
  }): Promise<Project> {
    const actor   = await this.users.findById(cmd.actorId);
    if (!actor?.activo) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");

    const built: Record<string, unknown> = {};
    const raw = cmd.changes as Record<string, unknown> | null;
    if (raw?.revision !== undefined && (!Number.isSafeInteger(raw.revision) || raw.revision !== (project.revision ?? 0))) throw new ConflictError("La obra ha cambiado. Actualiza los datos antes de guardar.");
    const changes = projectChanges(raw && typeof raw === "object" && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "revision")) : cmd.changes);

    if (actor.rol === "admin") {
      // Admin allowlist — clienteId and profesionalesAsignados are NEVER allowed via this endpoint
      // (use dedicated endpoints for reassigning client or managing professionals)
      const allowed: Array<keyof Project> = ["progreso", "estado", "nombre", "descripcion", "direccion", "tipo", "fechaInicio", "fechaFinPrevista", "hitos"];
      for (const key of allowed) {
        const v = (changes as Record<string, unknown>)[key];
        if (v !== undefined) built[key] = v;
      }
    } else if (actor.rol === "profesional") {
      PermissionPolicy.authorize(actor, "project.read", { project });
      if (project.estado === "finalizado") throw new ForbiddenError("Una obra finalizada es de solo lectura");
      // Profesional: ONLY progreso and hitos, and only if policy allows
      const forbidden = Object.keys(changes).filter(k => k !== "progreso" && k !== "hitos");
      if (forbidden.length) throw new ForbiddenError(`No puedes editar: ${forbidden.join(", ")}`);
      if (changes.progreso !== undefined) {
        PermissionPolicy.authorize(actor, "project.update.progress", { project });
        built.progreso = changes.progreso;
      }
      if (changes.hitos !== undefined) {
        PermissionPolicy.authorize(actor, "project.update.milestones", { project });
        if (changes.hitos.length !== project.hitos.length || changes.hitos.some((h, index) => {
          const current = project.hitos[index];
          return !current || h.id !== current.id || h.nombre !== current.nombre || h.fecha.getTime() !== current.fecha.getTime();
        })) throw new ForbiddenError("Solo puedes marcar como completados los hitos existentes");
        built.hitos = changes.hitos;
      }
    } else {
      throw new ForbiddenError();
    }

    const allowedChanges = built as Partial<Project>;
    if (allowedChanges.estado && allowedChanges.estado !== project.estado) {
      const transitions: Record<Project["estado"], Project["estado"][]> = {
        planificacion: ["en_curso"], en_curso: ["pausado", "finalizado"],
        pausado: ["en_curso", "finalizado"], finalizado: [],
      };
      if (!transitions[project.estado].includes(allowedChanges.estado)) throw new ConflictError("Transición de estado no permitida");
    }
    if (allowedChanges.estado === "finalizado" && (allowedChanges.progreso ?? project.progreso).value !== 100) throw new ValidationError("Para finalizar la obra, el progreso debe ser del 100 %");
    if((allowedChanges.fechaFinPrevista??project.fechaFinPrevista)<(allowedChanges.fechaInicio??project.fechaInicio))throw new ValidationError("La fecha final no puede ser anterior al inicio");
    // Capture old values before repositories that mutate in place run.
    const previousState = project.estado;
    const visibleKeys = ["estado","progreso","hitos","fechaInicio","fechaFinPrevista","nombre","descripcion","direccion","tipo","presupuesto"] as const;
    const changedFields = visibleKeys.filter(key => key in built && JSON.stringify(project[key]) !== JSON.stringify(built[key]));

    const updated = await this.projects.update(cmd.projectId, allowedChanges, project.revision ?? 0);

    // Emit ProjectCompleted if we just transitioned to finalizado
    if (changes.estado === "finalizado" && previousState !== "finalizado") {
      await this.events.emit({
        type: "ProjectCompleted", eventId: crypto.randomUUID(), occurredAt: new Date(),
        actorId: actor.id, actorName: actor.nombre,
        ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
        projectId: project.id,
      });
    }

    if(changedFields.length)await this.events.emit({
      type:"ProjectUpdated",eventId:crypto.randomUUID(),occurredAt:new Date(),
      actorId:actor.id,actorName:actor.nombre,ip:cmd.ctx.ip,userAgent:cmd.ctx.userAgent,
      projectId:project.id,changedFields,
    });
    return updated;
  }
}

export class GetProjectUseCase {
  constructor(private readonly users: IUserRepository, private readonly projects: IProjectRepository) {}
  async execute(cmd: { actorId: number; projectId: number }): Promise<Project> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor?.activo) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    // Do not reveal whether another client's or professional's project exists.
    if (!PermissionPolicy.can(actor, "project.read", { project })) throw new NotFoundError("Proyecto");
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
    return this.projects.update(project.id, { profesionalesAsignados: [...project.profesionalesAsignados, assignment] }, project.revision ?? 0);
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
    return this.projects.update(project.id, { profesionalesAsignados: remaining }, project.revision ?? 0);
  }
}

export class ListProjectsUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
  ) {}
  async execute(cmd: { actorId: number }): Promise<Project[]> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor?.activo) throw new ForbiddenError();
    if (actor.rol === "admin")        return this.projects.findAll();
    if (actor.rol === "cliente")      return this.projects.findByClient(actor.id);
    if (actor.rol === "profesional")  return this.projects.findByProfesional(actor.id);
    return [];
  }
}
