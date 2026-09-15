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
import { ValidationError, RateLimitError } from "@reformapro/domain/errors";
import { ClientContext } from "./auth.use-cases.js";

export interface ISolicitudRepository {
  save(s: { nombre: string; email: string; telefono: string; tipo: string; descripcion: string; fecha: Date; estado: "pendiente"; ip: string }): Promise<{ id: number }>;
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
    if (!cmd.descripcion?.trim() || cmd.descripcion.length < 20) {
      throw new ValidationError("La descripción debe tener al menos 20 caracteres", "descripcion");
    }
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
