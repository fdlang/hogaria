/**
 * Project HTTP controller.
 * Permissions (admin-only for delete; profesional restricted to progreso/hitos)
 * are enforced inside the use cases via PermissionPolicy.
 */

import { AssignProjectProfessionalUseCase, DeleteProjectUseCase, GetProjectUseCase, ListProjectsUseCase, UnassignProjectProfessionalUseCase, UpdateProjectUseCase } from "../../application/use-cases/project.use-cases.js";
import { Project } from "@reformapro/domain/entities";
import type { IUserRepository } from "@reformapro/domain/repositories";
import { ForbiddenError } from "@reformapro/domain/errors";
import { toHttpError } from "./errorMiddleware.js";
import { HttpRequest, HttpResponse } from "./authController.js";

export function toProjectDTO(p: Project, audience: "full" | "professional" = "full") {
  const operational = {
    id: p.id, revision: p.revision ?? 0, nombre: p.nombre, descripcion: p.descripcion,
    direccion: p.direccion, tipo: p.tipo,
    estado: p.estado,
    progreso: p.progreso.value,
    fechaInicio:      p.fechaInicio.toISOString(),
    fechaFinPrevista: p.fechaFinPrevista.toISOString(),
    profesionalesAsignados: p.profesionalesAsignados,
    hitos: p.hitos.map(h => ({
      id: h.id, nombre: h.nombre, completado: h.completado,
      fecha: h.fecha.toISOString(),
    })),
  };
  return audience === "professional" ? operational : {
    ...operational,
    estimateId: p.estimateId,
    clienteId: p.clienteId,
    presupuesto: p.presupuesto.amount,
  };
}

export function projectController(deps: {
  users: IUserRepository;
  update: UpdateProjectUseCase;
  delete: DeleteProjectUseCase;
  list:   ListProjectsUseCase;
  get: GetProjectUseCase;
  assign: AssignProjectProfessionalUseCase;
  unassign: UnassignProjectProfessionalUseCase;
}) {
  const ctxOf = (req: HttpRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" });
  const dtoFor = async (actorId: number, project: Project) => {
    const actor = await deps.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    return toProjectDTO(project, actor?.rol === "profesional" ? "professional" : "full");
  };

  return {
    // PATCH /projects/:id
    async update(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const project = await deps.update.execute({
          actorId: req.actorId,
          projectId: parseInt(req.params.id, 10),
          ctx: ctxOf(req),
          changes: req.body as never,
        });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // DELETE /projects/:id
    async delete(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        await deps.delete.execute({ actorId: req.actorId, projectId: parseInt(req.params.id, 10) });
        return { status: 204, body: null };
      } catch (e) { return toHttpError(e); }
    },

    // GET /projects/:id
    async get(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const project = await deps.get.execute({ actorId: req.actorId, projectId: parseInt(req.params.id, 10) });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // POST /projects/:id/professionals
    async assign(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const body = (req.body ?? {}) as { userId?: number };
        const project = await deps.assign.execute({ actorId: req.actorId, projectId: Number(req.params.id), userId: body.userId! });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // DELETE /projects/:id/professionals/:userId
    async unassign(req: HttpRequest & { actorId: number; params: { id: string; userId: string } }): Promise<HttpResponse> {
      try {
        const project = await deps.unassign.execute({ actorId: req.actorId, projectId: parseInt(req.params.id, 10), userId: parseInt(req.params.userId, 10) });
        return { status: 200, body: await dtoFor(req.actorId, project) };
      } catch (e) { return toHttpError(e); }
    },

    // GET /projects
    async list(req: HttpRequest & { actorId: number }): Promise<HttpResponse> {
      try {
        const projects = await deps.list.execute({ actorId: req.actorId });
        return { status: 200, body: await Promise.all(projects.map(project => dtoFor(req.actorId, project))) };
      } catch (e) { return toHttpError(e); }
    },
  };
}
