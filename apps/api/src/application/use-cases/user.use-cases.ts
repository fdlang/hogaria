/**
 * User use cases.
 * Admin-only operations. Password management uses the PasswordHasher port.
 */

import { IUserRepository } from "@reformapro/domain/repositories";
import { IEventEmitter } from "@reformapro/domain/events";
import { User, UserRole, Profesion } from "@reformapro/domain/entities";
import { Email } from "@reformapro/domain/value-objects";
import { ValidationError, ForbiddenError, NotFoundError, ConflictError } from "@reformapro/domain/errors";
import { ClientContext } from "./auth.use-cases.js";
import { PasswordHasher } from "../../infrastructure/database/inMemoryRepositories.js";
import { AccountActivationUseCases } from "./account-activation.use-cases.js";

export interface CreateUserCommand {
  actorId: number;
  email: string;
  nombre: string;
  rol: UserRole;
  profesion?: Profesion | undefined;
  telefono?: string | undefined;
  ctx: ClientContext;
}

export class CreateUserUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tempPasswordGen: () => string,
    private readonly events: IEventEmitter,
    private readonly activation?: AccountActivationUseCases,
  ) {}

  async execute(cmd: CreateUserCommand): Promise<{ user: User; invitationSent: boolean }> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();

    if (!cmd.nombre?.trim()) throw new ValidationError("Nombre obligatorio", "nombre");
    if (cmd.rol === "profesional" && !cmd.profesion) {
      throw new ValidationError("La profesión es obligatoria para profesionales", "profesion");
    }

    const email = Email.of(cmd.email); // throws ValidationError if malformed
    const existing = await this.users.findByEmail(email.value);
    if (existing) throw new ConflictError("Ya existe un usuario con ese email");
    const activation = this.activation;
    if (cmd.rol === "cliente") {
      if (!activation) throw new ConflictError("El servicio de invitaciones no está configurado");
      activation.ensureConfigured();
    }

    // A client never receives this random placeholder. They set their own password
    // through the one-time activation link.
    const temporaryPassword = this.tempPasswordGen();
    const passwordHash = await this.hasher.hash(temporaryPassword);

    const user: User = {
      id: 0, // repository assigns
      email, nombre: cmd.nombre.trim(), rol: cmd.rol,
      activo: cmd.rol === "cliente" ? false : true, createdAt: new Date(),
      ...(cmd.profesion !== undefined ? { profesion: cmd.profesion } : {}),
      ...(cmd.telefono  !== undefined ? { telefono:  cmd.telefono  } : {}),
    };
    const saved = await this.users.save(user, passwordHash);
    try {
      if (saved.rol === "cliente") await activation!.invite(actor.id, saved.id, cmd.ctx);
    } catch (error) {
      // No related records exist yet: compensate a failed invitation so the admin
      // can retry creation instead of inheriting a silent, inactive account.
      await this.users.delete(saved.id).catch(() => undefined);
      throw error;
    }
    await this.events.emit({
      type: "UserCreated", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor.id, actorName: actor.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent,
      userId: saved.id, role: cmd.rol,
    });
    return { user: saved, invitationSent: saved.rol === "cliente" };
  }
}

export class UpdateUserUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: PasswordHasher,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: {
    actorId: number;
    userId: number;
    changes: Partial<Pick<User, "nombre" | "telefono" | "profesion" | "activo">> & { newPassword?: string };
    ctx: ClientContext;
  }): Promise<User> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();

    const target = await this.users.findById(cmd.userId);
    if (!target) throw new NotFoundError("Usuario");

    const { newPassword, ...fields } = cmd.changes;
    const updated = await this.users.update(cmd.userId, fields);

    if (newPassword) {
      if (newPassword.length < 8) throw new ValidationError("Contraseña mínimo 8 caracteres", "newPassword");
      const hash = await this.hasher.hash(newPassword);
      await this.users.updatePassword(cmd.userId, hash);
      await this.events.emit({
        type: "UserPasswordReset", eventId: crypto.randomUUID(), occurredAt: new Date(),
        actorId: actor.id, actorName: actor.nombre,
        ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent, userId: target.id,
      });
    }

    return updated;
  }
}

export class DeleteUserUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly events: IEventEmitter,
  ) {}

  async execute(cmd: { actorId: number; userId: number; ctx: ClientContext }): Promise<void> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    if (cmd.actorId === cmd.userId) throw new ValidationError("No puedes eliminar tu propia cuenta");

    const target = await this.users.findById(cmd.userId);
    if (!target) throw new NotFoundError("Usuario");

    // Soft-delete by deactivating (keeps referential integrity for historical budgets/audit)
    await this.users.update(cmd.userId, { activo: false });
    await this.events.emit({
      type: "UserDeactivated", eventId: crypto.randomUUID(), occurredAt: new Date(),
      actorId: actor.id, actorName: actor.nombre,
      ip: cmd.ctx.ip, userAgent: cmd.ctx.userAgent, userId: target.id,
    });
  }
}

export class ListUsersUseCase {
  constructor(private readonly users: IUserRepository) {}
  async execute(cmd: { actorId: number; role?: UserRole | undefined }): Promise<User[]> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    return cmd.role ? this.users.findByRole(cmd.role) : this.users.findAll();
  }
}
