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
import { ACCOUNT_PASSWORD_REQUIREMENTS, isValidAccountPassword, isValidSpanishPhone, PROFESIONES } from "@reformapro/domain";

const isProfesion = (value: unknown): value is Profesion =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(PROFESIONES, value);

interface CreateUserCommand {
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
    if (cmd.rol === "profesional" && !isProfesion(cmd.profesion)) {
      throw new ValidationError("La profesión es obligatoria para profesionales", "profesion");
    }
    if (cmd.rol !== "profesional" && cmd.profesion !== undefined) {
      throw new ValidationError("La profesión solo corresponde a profesionales", "profesion");
    }
    if (!isValidSpanishPhone(cmd.telefono ?? "")) throw new ValidationError("Teléfono no válido", "telefono");

    const email = Email.of(cmd.email); // throws ValidationError if malformed
    const existing = await this.users.findByEmail(email.value);
    if (existing) throw new ConflictError("Ya existe un usuario con ese email");
    const activation = this.activation;
    if (!activation) throw new ConflictError("El servicio de invitaciones no está configurado");
    activation.ensureConfigured();

    // A client never receives this random placeholder. They set their own password
    // through the one-time activation link.
    const temporaryPassword = this.tempPasswordGen();
    const passwordHash = await this.hasher.hash(temporaryPassword);

    const user: User = {
      id: 0, // repository assigns
      email, nombre: cmd.nombre.trim(), rol: cmd.rol,
      // Every account sets its own password through a one-time link.
      activo: false, accountStatus: "pending_activation", createdAt: new Date(),
      ...(cmd.profesion !== undefined ? { profesion: cmd.profesion } : {}),
      ...(cmd.telefono?.trim() ? { telefono: cmd.telefono.trim() } : {}),
    };
    const saved = await this.users.save(user, passwordHash);
    try {
      await activation.invite(actor.id, saved.id, cmd.ctx);
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
    return { user: saved, invitationSent: true };
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

    const allowed = new Set(["nombre", "telefono", "profesion", "activo", "newPassword"]);
    if (Object.keys(cmd.changes).some(key => !allowed.has(key))) throw new ValidationError("Campo de usuario no permitido");
    const { newPassword, ...fields } = cmd.changes;
    if (fields.activo !== undefined && typeof fields.activo !== "boolean") throw new ValidationError("Estado no válido", "activo");
    if (fields.activo === true && !target.activo) throw new ConflictError("Reactiva la cuenta mediante un enlace de acceso seguro");
    if (fields.nombre !== undefined && (typeof fields.nombre !== "string" || !fields.nombre.trim())) throw new ValidationError("Nombre obligatorio", "nombre");
    if (fields.telefono !== undefined) {
      if (typeof fields.telefono !== "string" || !isValidSpanishPhone(fields.telefono)) throw new ValidationError("Teléfono no válido", "telefono");
      fields.telefono = fields.telefono.trim();
    }
    if (fields.profesion !== undefined && (target.rol !== "profesional" || !isProfesion(fields.profesion))) throw new ValidationError("Profesión no válida", "profesion");
    if (cmd.actorId === cmd.userId && fields.activo === false) throw new ValidationError("No puedes desactivar tu propia cuenta");
    if (newPassword !== undefined && !isValidAccountPassword(newPassword)) throw new ValidationError(ACCOUNT_PASSWORD_REQUIREMENTS, "newPassword");
    const passwordHash = newPassword === undefined ? undefined : await this.hasher.hash(newPassword);
    const updated = await this.users.update(cmd.userId, fields, passwordHash);

    if (newPassword) {
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
    await this.users.update(cmd.userId, { activo: false, accountStatus: "archived" });
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
