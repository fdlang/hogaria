/**
 * Project use cases.
 * Admin creates/edits/deletes; profesionales can only update progreso/hitos.
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
    if (!actor) throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");

    const built: Record<string, unknown> = {};
    const changes = projectChanges(cmd.changes);

    if (actor.rol === "admin") {
      // Admin allowlist — clienteId and profesionalesAsignados are NEVER allowed via this endpoint
      // (use dedicated endpoints for reassigning client or managing professionals)
      const allowed: Array<keyof Project> = ["progreso", "estado", "nombre", "descripcion", "direccion", "tipo", "presupuesto", "fechaInicio", "fechaFinPrevista", "hitos"];
      for (const key of allowed) {
        const v = (changes as Record<string, unknown>)[key];
        if (v !== undefined) built[key] = v;
      }
    } else if (actor.rol === "profesional") {
      PermissionPolicy.authorize(actor, "project.read", { project });
      // Profesional: ONLY progreso and hitos, and only if policy allows
      const forbidden = Object.keys(changes).filter(k => k !== "progreso" && k !== "hitos");
      if (forbidden.length) throw new ForbiddenError(`No puedes editar: ${forbidden.join(", ")}`);
      if (changes.progreso !== undefined) {
        PermissionPolicy.authorize(actor, "project.update.progress", { project });
        built.progreso = changes.progreso;
      }
      if (changes.hitos !== undefined) {
        PermissionPolicy.authorize(actor, "project.update.milestones", { project });
        built.hitos = changes.hitos;
      }
    } else {
      throw new ForbiddenError();
    }

    const allowedChanges = built as Partial<Project>;
    if((allowedChanges.fechaFinPrevista??project.fechaFinPrevista)<(allowedChanges.fechaInicio??project.fechaInicio))throw new ValidationError("La fecha final no puede ser anterior al inicio");
    // Capture old values before repositories that mutate in place run.
    const previousState = project.estado;
    const visibleKeys = ["estado","progreso","hitos","fechaInicio","fechaFinPrevista","nombre","descripcion","direccion","tipo","presupuesto"] as const;
    const changedFields = visibleKeys.filter(key => key in built && JSON.stringify(project[key]) !== JSON.stringify(built[key]));

    const updated = await this.projects.update(cmd.projectId, allowedChanges);

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

export class DeleteProjectUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly hasWorkHistory?: (projectId: number) => Promise<boolean>,
  ) {}
  async execute(cmd: { actorId: number; projectId: number }): Promise<void> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const project = await this.projects.findById(cmd.projectId);
    if (!project) throw new NotFoundError("Proyecto");
    if (await this.hasWorkHistory?.(project.id)) throw new ConflictError("La obra tiene registros o previsiones de trabajo. Conserva el histórico y marca la obra como finalizada");
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
