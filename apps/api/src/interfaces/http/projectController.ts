/**
 * Project HTTP controller.
 * Permissions (profesional restricted to progreso/hitos)
 * are enforced inside the use cases via PermissionPolicy.
 */

import { AssignProjectProfessionalUseCase, GetProjectUseCase, ListProjectsUseCase, UnassignProjectProfessionalUseCase, UpdateProjectUseCase } from "../../application/use-cases/project.use-cases.js";
import { Project } from "@reformapro/domain/entities";
import { aggregateFiscalSnapshots } from "@reformapro/domain";
import type { IUserRepository } from "@reformapro/domain/repositories";
import { ForbiddenError, ValidationError } from "@reformapro/domain/errors";
import { toHttpError } from "./errorMiddleware.js";
import { HttpRequest, HttpResponse } from "./authController.js";
import { parsePagination, wantsPagination } from "./pagination.js";

export function toProjectDTO(p: Project, audience: "full" | "professional" | "client" = "full") {
  const shared = {
    id: p.id, revision: p.revision ?? 0, nombre: p.nombre, descripcion: p.descripcion,
    direccion: p.direccion, tipo: p.tipo,
    estado: p.estado,
    progreso: p.progreso.value,
    fechaInicio:      p.fechaInicio.toISOString(),
    fechaFinPrevista: p.fechaFinPrevista.toISOString(),
    hitos: p.hitos.map(h => ({
      id: h.id, nombre: h.nombre, completado: h.completado,
      fecha: h.fecha.toISOString(),
    })),
  };
  const operational = { ...shared, profesionalesAsignados: p.profesionalesAsignados };
  if (audience === "professional") return operational;
  const commercial = {
    ...(audience === "client" ? shared : operational),
    estimateId: p.estimateId,
    clienteId: p.clienteId,
    presupuesto: p.presupuesto.amount,
    financialSummary: p.fiscalSnapshots?.length ? aggregateFiscalSnapshots(p.fiscalSnapshots) : null,
  };
  return commercial;
}

export function projectController(deps: {
  users: IUserRepository;
  update: UpdateProjectUseCase;
  list:   ListProjectsUseCase;
  get: GetProjectUseCase;
  assign: AssignProjectProfessionalUseCase;
  unassign: UnassignProjectProfessionalUseCase;
}) {
  const positiveId = (value: unknown, field = "id") => {
    const id = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("Identificador no válido", field);
    return id;
  };
  const ctxOf = (req: HttpRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" });
  const dtoFor = async (actorId: number, project: Project) => {
    const actor = await deps.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    return toProjectDTO(project, actor.rol === "profesional" ? "professional" : actor.rol === "cliente" ? "client" : "full");
  };

  return {
    // PATCH /projects/:id
    async update(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const project = await deps.update.execute({
          actorId: req.actorId,
          projectId: positiveId(req.params.id),
          ctx: ctxOf(req),
          changes: req.body as never,
        });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // GET /projects/:id
    async get(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const project = await deps.get.execute({ actorId: req.actorId, projectId: positiveId(req.params.id) });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // POST /projects/:id/professionals
    async assign(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const body = (req.body ?? {}) as { userId?: number };
        const project = await deps.assign.execute({ actorId: req.actorId, projectId: positiveId(req.params.id), userId: positiveId(body.userId, "userId") });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // DELETE /projects/:id/professionals/:userId
    async unassign(req: HttpRequest & { actorId: number; params: { id: string; userId: string } }): Promise<HttpResponse> {
      try {
        const project = await deps.unassign.execute({ actorId: req.actorId, projectId: positiveId(req.params.id), userId: positiveId(req.params.userId, "userId") });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // GET /projects
    async list(req: HttpRequest & { actorId: number; query: { page?: string; limit?: string; search?: string; status?: string } }): Promise<HttpResponse> {
      try {
        if (wantsPagination(req.query)) {
          const status = req.query.status ?? "all";
          if (!["all","planificacion","en_curso","pausado","finalizado"].includes(status)) throw new ValidationError("Estado no válido", "status");
          const page = await deps.list.executePage({ actorId: req.actorId, ...parsePagination(req.query), search: (req.query.search ?? "").trim().slice(0, 100), status: status as Project["estado"] | "all" });
          return { status: 200, body: { ...page, items: await Promise.all(page.items.map(project => dtoFor(req.actorId, project))) } };
        }
        const projects = await deps.list.execute({ actorId: req.actorId });
        return { status: 200, body: await Promise.all(projects.map(project => dtoFor(req.actorId, project))) };
      } catch (e) { return toHttpError(e); }
    },
  };
}
