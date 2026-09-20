/**
 * User HTTP controller.
 * All endpoints are admin-only; permission enforcement lives in the use cases.
 */

import { CreateUserUseCase, UpdateUserUseCase, DeleteUserUseCase, ListUsersUseCase } from "../../application/use-cases/user.use-cases.js";
import { AccountActivationUseCases } from "../../application/use-cases/account-activation.use-cases.js";
import { UserRole } from "@reformapro/domain/entities";
import { toHttpError } from "./errorMiddleware.js";
import { ValidationError } from "@reformapro/domain/errors";
import { HttpRequest, HttpResponse } from "./authController.js";

import { toUserDTO } from "./userDTO.js";

export function userController(deps: {
  create: CreateUserUseCase;
  update: UpdateUserUseCase;
  delete: DeleteUserUseCase;
  list:   ListUsersUseCase;
  activation: AccountActivationUseCases;
}) {
  const ctxOf = (req: HttpRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" });
  const idOf = (value: string) => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError("Identificador no válido"); return id; };

  return {
    // POST /users
    async create(req: HttpRequest & { actorId: number }): Promise<HttpResponse> {
      try {
        const body = req.body as { email?: unknown; nombre?: unknown; rol?: unknown; profesion?: unknown; telefono?: unknown };
        if (typeof body?.email !== "string" || typeof body.nombre !== "string" || !["admin","cliente","profesional"].includes(String(body.rol))) throw new ValidationError("Datos de usuario no válidos");
        if (body.telefono !== undefined && typeof body.telefono !== "string") throw new ValidationError("Teléfono no válido", "telefono");
        if (body.profesion !== undefined && typeof body.profesion !== "string") throw new ValidationError("Profesión no válida", "profesion");
        const { user, invitationSent } = await deps.create.execute({
          actorId: req.actorId, ctx: ctxOf(req),
          email: body.email, nombre: body.nombre, rol: body.rol as UserRole,
          profesion: body.profesion as never, telefono: body.telefono as string | undefined,
        });
        return { status: 201, body: { user: toUserDTO(user), invitationSent } };
      } catch (e) { return toHttpError(e); }
    },

    async resendInvitation(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try { const result = await deps.activation.invite(req.actorId, idOf(req.params.id), ctxOf(req)); return { status: 202, body: { email: result.email, expiresAt: result.expiresAt.toISOString() } }; } catch (e) { return toHttpError(e); }
    },

    async activate(req: HttpRequest): Promise<HttpResponse> {
      try { const body = req.body as { token?: string; password?: string }; await deps.activation.activate(body.token ?? "", body.password ?? ""); return { status: 204, body: null }; } catch (e) { return toHttpError(e); }
    },

    // PATCH /users/:id
    async update(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const body = req.body as { nombre?: string; telefono?: string; profesion?: string; activo?: boolean; newPassword?: string };
        const user = await deps.update.execute({
          actorId: req.actorId, userId: idOf(req.params.id),
          ctx: ctxOf(req),
          changes: body as never,
        });
        return { status: 200, body: toUserDTO(user) };
      } catch (e) { return toHttpError(e); }
    },

    // DELETE /users/:id (soft-delete)
    async delete(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        await deps.delete.execute({
          actorId: req.actorId, userId: idOf(req.params.id),
          ctx: ctxOf(req),
        });
        return { status: 204, body: null };
      } catch (e) { return toHttpError(e); }
    },

    // GET /users?role=cliente
    async list(req: HttpRequest & { actorId: number; query: { role?: string } }): Promise<HttpResponse> {
      try {
        const cmd: { actorId: number; role?: UserRole } = { actorId: req.actorId };
        if (req.query.role) { if (!["admin","cliente","profesional"].includes(req.query.role)) throw new ValidationError("Rol no válido", "role"); cmd.role = req.query.role as UserRole; }
        const users = await deps.list.execute(cmd);
        return { status: 200, body: users.map(toUserDTO) };
      } catch (e) { return toHttpError(e); }
    },
  };
}
