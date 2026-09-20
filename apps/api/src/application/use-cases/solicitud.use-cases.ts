/**
 * Solicitud (contact form) use case.
 *
 * PUBLIC endpoint — no auth token required. For security, enforces:
 *   - per-IP rate limit via ICooldownGate (Redis-backed in prod)
 *   - strict field allowlist (client cannot inject arbitrary fields)
 *   - length clamps to prevent DB bloat
 *   - email format validation via domain VO
 */

import { Email } from "@reformapro/domain/value-objects";
import { ForbiddenError, NotFoundError, ValidationError, RateLimitError } from "@reformapro/domain/errors";
import type { IUserRepository } from "@reformapro/domain/repositories";
import { ClientContext } from "./auth.use-cases.js";
import { isValidSpanishPhone } from "@reformapro/domain";

export type SolicitudStatus = "pendiente" | "contactado" | "rechazado";
export interface Solicitud {
  id: number; nombre: string; email: string; telefono: string; tipo: string;
  descripcion: string; fecha: Date; estado: SolicitudStatus; ip: string; motivo: string | null;
}
export interface ISolicitudRepository {
  save(s: Omit<Solicitud, "id" | "motivo">): Promise<{ id: number }>;
  findAll(): Promise<Solicitud[]>;
  findById(id: number): Promise<Solicitud | null>;
  update(id: number, changes: Pick<Solicitud, "estado" | "motivo">): Promise<Solicitud>;
}

// Rate-limit port — production impl would use Redis INCR + EXPIRE
export interface ICooldownGate {
  check(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export class SubmitSolicitudUseCase {
  constructor(
    private readonly solicitudes: ISolicitudRepository,
    private readonly gate: ICooldownGate,
  ) {}

  async execute(cmd: {
    nombre: string; email: string; telefono?: string;
    tipo: string; descripcion: string; ctx: ClientContext;
  }): Promise<{ id: number }> {
    // Rate limit per IP — 3 submissions per hour
    const key = `solicitud:${cmd.ctx.ip}`;
    if (!(await this.gate.check(key, 3, 60 * 60 * 1000))) {
      throw new RateLimitError();
    }

    // Validation
    if (!cmd.nombre?.trim())         throw new ValidationError("Nombre obligatorio", "nombre");
    if (!cmd.tipo?.trim())           throw new ValidationError("Tipo obligatorio", "tipo");
    if (!cmd.descripcion?.trim() || cmd.descripcion.trim().length < 20) {
      throw new ValidationError("La descripción debe tener al menos 20 caracteres", "descripcion");
    }
    if (!isValidSpanishPhone(cmd.telefono ?? "")) throw new ValidationError("Teléfono no válido", "telefono");
    const email = Email.of(cmd.email); // throws if malformed

    // Allowlist + length clamps
    return this.solicitudes.save({
      nombre:      cmd.nombre.trim().slice(0, 100),
      email:       email.value,
      telefono:   (cmd.telefono ?? "").trim().slice(0, 20),
      tipo:        cmd.tipo.trim().slice(0, 100),
      descripcion: cmd.descripcion.trim().slice(0, 2000),
      fecha:       new Date(),
      estado:      "pendiente",
      ip:          cmd.ctx.ip,
    });
  }
}

export class ListSolicitudesUseCase {
  constructor(private readonly users: IUserRepository, private readonly solicitudes: ISolicitudRepository) {}
  async execute(actorId: number): Promise<Solicitud[]> {
    const actor = await this.users.findById(actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    return this.solicitudes.findAll();
  }
}

export class UpdateSolicitudStatusUseCase {
  constructor(private readonly users: IUserRepository, private readonly solicitudes: ISolicitudRepository) {}
  async execute(cmd: { actorId: number; solicitudId: number; estado: Exclude<SolicitudStatus, "pendiente">; motivo?: string }): Promise<Solicitud> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const solicitud = await this.solicitudes.findById(cmd.solicitudId);
    if (!solicitud) throw new NotFoundError("Solicitud");
    if (solicitud.estado !== "pendiente") throw new ValidationError("La solicitud ya ha sido gestionada");
    const motivo = cmd.estado === "rechazado" ? (cmd.motivo?.trim().slice(0, 500) || null) : null;
    if (cmd.estado === "rechazado" && !motivo) throw new ValidationError("Indica un motivo de rechazo", "reason");
    return this.solicitudes.update(solicitud.id, { estado: cmd.estado, motivo });
  }
}

// Simple in-memory impl for tests/demos. Sliding window.
export class InMemoryCooldownGate implements ICooldownGate {
  private readonly hits = new Map<string, number[]>();
  async check(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const hist = (this.hits.get(key) ?? []).filter(t => t > cutoff);
    if (hist.length >= limit) { this.hits.set(key, hist); return false; }
    hist.push(now);
    this.hits.set(key, hist);
    return true;
  }
}
