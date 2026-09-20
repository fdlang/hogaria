/**
 * Auth HTTP controller.
 *
 * Framework-agnostic: takes a generic `Router` interface so it can be wired
 * into Express, Fastify, Koa, Hono, or NestJS without modification.
 */

import { LoginUseCase } from "../../application/use-cases/auth.use-cases.js";
import { IUserRepository } from "@reformapro/domain/repositories";
import { toHttpError } from "./errorMiddleware.js";
import { UnauthorizedError, ValidationError } from "@reformapro/domain/errors";
import { toUserDTO } from "./userDTO.js";

export interface HttpRequest {
  body: unknown;
  headers: Record<string, string | undefined>;
  ip: string;
}
export interface HttpResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function authController(deps: {
  loginUseCase: LoginUseCase;
  users: IUserRepository;
  tokens: import("../../application/use-cases/auth.use-cases.js").ITokenService;
}) {
  return {
    // POST /auth/login
    async login(req: HttpRequest): Promise<HttpResponse> {
      try {
        const body = req.body as Record<string, unknown> | null;
        if (!body || typeof body.email !== "string" || typeof body.password !== "string") throw new ValidationError("Email y contraseña obligatorios");
        const { email, password } = body as { email: string; password: string };
        const ctx = { ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" };
        const { user, token, expiresAt } = await deps.loginUseCase.execute(email, password, ctx);
        return { status: 200, body: { user: toUserDTO(user), token, expiresAt } };
      } catch (e) { const { status, body } = toHttpError(e); return { status, body }; }
    },

    // GET /auth/me
    async me(req: HttpRequest): Promise<HttpResponse> {
      try {
        const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        const payload = await deps.tokens.verify(bearer);
        if (!payload) throw new UnauthorizedError();
        const user = await deps.users.findById(payload.userId);
        if (!user || !user.activo || (user.sessionVersion ?? 0) !== payload.sessionVersion) throw new UnauthorizedError();
        return { status: 200, body: toUserDTO(user) };
      } catch (e) { const { status, body } = toHttpError(e); return { status, body }; }
    },
  };
}

// Generic auth middleware — extracts actorId for controllers downstream
export function requireAuth(tokens: import("../../application/use-cases/auth.use-cases.js").ITokenService, users: IUserRepository) {
  return async (req: HttpRequest): Promise<{ actorId: number } | { status: 401; body: unknown }> => {
    try {
      const bearer  = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const payload = await tokens.verify(bearer);
      if (!payload) return { status: 401, body: { code: "UNAUTHORIZED", message: "Token inválido o expirado" } };
      const user = await users.findById(payload.userId);
      if (!user || !user.activo || (user.sessionVersion ?? 0) !== payload.sessionVersion) return { status: 401, body: { code: "UNAUTHORIZED", message: "Sesión no disponible" } };
      return { actorId: payload.userId };
    } catch { return { status: 401, body: { code: "UNAUTHORIZED", message: "Token inválido" } }; }
  };
}
