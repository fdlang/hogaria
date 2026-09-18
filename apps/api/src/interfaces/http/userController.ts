/**
 * User HTTP controller.
 * All endpoints are admin-only; permission enforcement lives in the use cases.
 */

import { CreateUserUseCase, UpdateUserUseCase, DeleteUserUseCase, ListUsersUseCase } from "../../application/use-cases/user.use-cases.js";
import { AccountActivationUseCases } from "../../application/use-cases/account-activation.use-cases.js";
import { User, UserRole } from "@reformapro/domain/entities";
import { toHttpError } from "./errorMiddleware.js";
import { HttpRequest, HttpResponse } from "./authController.js";

export function toUserDTO(u: User) {
  return {
    id: u.id, email: u.email.value, nombre: u.nombre, rol: u.rol,
    profesion: u.profesion ?? null, telefono: u.telefono ?? null,
    activo: u.activo, createdAt: u.createdAt.toISOString(),
  };
}

export function userController(deps: {
  create: CreateUserUseCase;
  update: UpdateUserUseCase;
  delete: DeleteUserUseCase;
  list:   ListUsersUseCase;
  activation: AccountActivationUseCases;
}) {
  const ctxOf = (req: HttpRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" });

  return {
    // POST /users
    async create(req: HttpRequest & { actorId: number }): Promise<HttpResponse> {
      try {
        const body = req.body as { email: string; nombre: string; rol: UserRole; profesion?: string; telefono?: string };
        const { user, invitationSent } = await deps.create.execute({
          actorId: req.actorId, ctx: ctxOf(req),
          email: body.email, nombre: body.nombre, rol: body.rol,
          profesion: body.profesion as never, telefono: body.telefono,
        });
        return { status: 201, body: { user: toUserDTO(user), invitationSent } };
      } catch (e) { return toHttpError(e); }
    },

    async resendInvitation(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try { const result = await deps.activation.invite(req.actorId, parseInt(req.params.id, 10), ctxOf(req)); return { status: 202, body: { email: result.email, expiresAt: result.expiresAt.toISOString() } }; } catch (e) { return toHttpError(e); }
    },

    async activate(req: HttpRequest): Promise<HttpResponse> {
      try { const body = req.body as { token?: string; password?: string }; await deps.activation.activate(body.token ?? "", body.password ?? ""); return { status: 204, body: null }; } catch (e) { return toHttpError(e); }
    },

    // PATCH /users/:id
    async update(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const body = req.body as { nombre?: string; telefono?: string; profesion?: string; activo?: boolean; newPassword?: string };
        const user = await deps.update.execute({
          actorId: req.actorId, userId: parseInt(req.params.id, 10),
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
          actorId: req.actorId, userId: parseInt(req.params.id, 10),
          ctx: ctxOf(req),
        });
        return { status: 204, body: null };
      } catch (e) { return toHttpError(e); }
    },

    // GET /users?role=cliente
    async list(req: HttpRequest & { actorId: number; query: { role?: string } }): Promise<HttpResponse> {
      try {
        const cmd: { actorId: number; role?: UserRole } = { actorId: req.actorId };
        if (req.query.role) cmd.role = req.query.role as UserRole;
        const users = await deps.list.execute(cmd);
        return { status: 200, body: users.map(toUserDTO) };
      } catch (e) { return toHttpError(e); }
    },
  };
}
