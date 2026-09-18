/**
 * Auth use cases — orchestrate auth flow using repositories + crypto service.
 * Each use case is a function OR a class with a single .execute() method (SRP).
 */

import { IUserRepository } from "@reformapro/domain/repositories";
import { IEventEmitter } from "@reformapro/domain/events";
import { UnauthorizedError, ValidationError } from "@reformapro/domain/errors";
import { User } from "@reformapro/domain/entities";
import { RateLimitError } from "@reformapro/domain/errors";
import type { ICooldownGate } from "./solicitud.use-cases.js";

export interface ITokenService {
  sign(payload: { userId: number; email: string; rol: string; exp: number }): Promise<string>;
  verify(token: string): Promise<{ userId: number; email: string; rol: string; exp: number } | null>;
}

export interface ClientContext {
  ip: string;
  userAgent: string;
}

export interface LoginResult {
  user: Omit<User, never> & { password?: never };
  token: string;
  expiresAt: number;
}

export class LoginUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly tokens: ITokenService,
    private readonly events: IEventEmitter,
    private readonly loginGate: ICooldownGate,
    private readonly tokenTTLms: number = 8 * 60 * 60 * 1000, // 8 hours
  ) {}

  async execute(email: string, password: string, ctx: ClientContext): Promise<LoginResult> {
    if (!email || !password) throw new ValidationError("Email y contraseña obligatorios");
    if (!(await this.loginGate.check(`login:${ctx.ip}:${email.trim().toLowerCase()}`, 8, 15 * 60 * 1000))) {
      throw new RateLimitError("Demasiados intentos. Espera unos minutos antes de volver a intentarlo.");
    }

    const user = await this.users.verifyPassword(email, password);
    if (!user)  throw new UnauthorizedError("Credenciales incorrectas");
    if (!user.activo) throw new UnauthorizedError("Usuario desactivado");

    const exp = Date.now() + this.tokenTTLms;
    const token = await this.tokens.sign({
      userId: user.id,
      email: user.email.value,
      rol: user.rol,
      exp,
    });

    await this.events.emit({
      type: "UserCreated", // semantic mismatch — should be LoginSuccess; adjust if added to DomainEvent union
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: user.id,
      actorName: user.nombre,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      userId: user.id,
      role: user.rol,
    } as never);

    return { user, token, expiresAt: exp };
  }
}
