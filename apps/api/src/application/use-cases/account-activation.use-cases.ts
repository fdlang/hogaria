import type { IUserRepository } from "@reformapro/domain/repositories";
import { ConflictError, ForbiddenError, ValidationError } from "@reformapro/domain/errors";
import type { ClientContext } from "./auth.use-cases.js";
import { ACCOUNT_PASSWORD_REQUIREMENTS, isValidAccountPassword } from "@reformapro/domain";
import type { IEventEmitter } from "@reformapro/domain/events";

export interface ActivationToken { userId: number; tokenHash: string; expiresAt: Date; usedAt: Date | null; }
export interface ActivationDelivery {
  id: string;
  tokenHash: string;
  to: string;
  name: string;
  activationUrl: string;
  expiresAt: Date;
  purpose: "activation" | "password_reset";
}
export interface IActivationTokenRepository {
  /** Atomically reserve one current invitation per user. */
  reserve(token: ActivationToken, now: Date, delivery?: ActivationDelivery, markPendingActivation?: boolean): Promise<boolean>;
  stage(token: ActivationToken): Promise<void>;
  promote(userId: number, tokenHash: string): Promise<void>;
  discard(tokenHash: string): Promise<void>;
  findValid(tokenHash: string, now: Date): Promise<ActivationToken | null>;
  /** Consume a still-valid link and activate its account in one transaction. */
  complete(tokenHash: string, passwordHash: string): Promise<void>;
  claimDelivery(tokenHash?: string): Promise<ActivationDelivery | null>;
  finishDelivery(id: string, state: "accepted" | "pending"): Promise<void>;
}
export interface ITransactionalEmail { isConfigured(): boolean; sendActivation(input: { to: string; name: string; activationUrl: string; expiresAt: Date; purpose?: "activation" | "password_reset" }): Promise<void>; }

const encoder = new TextEncoder();
const base64Url = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))
  .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const tokenHash = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))), byte => byte.toString(16).padStart(2, "0")).join("");
const newToken = () => base64Url(crypto.getRandomValues(new Uint8Array(32)));

export class AccountActivationUseCases {
  constructor(private readonly users: IUserRepository, private readonly tokens: IActivationTokenRepository, private readonly email: ITransactionalEmail, private readonly appUrl: string, private readonly ttlMs = 24 * 60 * 60 * 1000, private readonly events?: IEventEmitter) {}
  ensureConfigured() {
    let hasPublicUrl = false;
    try {
      const url = new URL(this.appUrl);
      hasPublicUrl = url.protocol === "https:" && !url.username && !url.password && !!url.hostname;
    } catch { hasPublicUrl = false; }
    if (!this.email.isConfigured() || !hasPublicUrl) {
      throw new ConflictError("No se puede enviar la invitación: configura RESEND_API_KEY, EMAIL_FROM y APP_URL en Producción y vuelve a desplegar");
    }
  }
  async invite(actorId: number, userId: number, context: ClientContext) {
    const actor = await this.users.findById(actorId); if (!actor || actor.rol !== "admin") throw new ForbiddenError(); this.ensureConfigured();
    const user = await this.users.findById(userId);
    if (!user) throw new ValidationError("La cuenta no existe", "userId");
    if (user.activo) throw new ConflictError("La cuenta ya está activada");
    return this.deliverAccess(user, context, "activation");
  }
  async resetAccess(actorId: number, userId: number, context: ClientContext) {
    const actor = await this.users.findById(actorId); if (!actor || actor.rol !== "admin") throw new ForbiddenError(); this.ensureConfigured();
    const user = await this.users.findById(userId);
    if (!user) throw new ValidationError("La cuenta no existe", "userId");
    if (!user.activo || user.accountStatus !== "active") throw new ConflictError("Solo se puede restablecer una cuenta activa");
    await this.events?.emit({
      type: "UserAccessResetRequested",
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      actorId: actor.id,
      actorName: actor.nombre,
      ip: context.ip,
      userAgent: context.userAgent,
      userId: user.id,
    });
    return this.deliverAccess(user, context, "password_reset");
  }
  private async deliverAccess(
    user: NonNullable<Awaited<ReturnType<IUserRepository["findById"]>>>,
    context: ClientContext,
    purpose: "activation" | "password_reset",
  ) {
    const reactivating = user.accountStatus === "archived";
    const token = newToken(); const expiresAt = new Date(Date.now() + this.ttlMs); const hash = await tokenHash(token);
    const activationUrl = `${this.appUrl.replace(/\/$/, "")}/#/activar-cuenta?token=${encodeURIComponent(token)}`;
    const delivery: ActivationDelivery = { id: crypto.randomUUID(), tokenHash: hash, to: user.email.value, name: user.nombre, activationUrl, expiresAt, purpose };
    const reserved = await this.tokens.reserve({ userId: user.id, tokenHash: hash, expiresAt, usedAt: null }, new Date(), delivery, reactivating);
    if (!reserved) {
      return { sent: false as const, status: "existing_or_in_progress" as const, email: user.email.value, requestedBy: context.ip };
    }
    const sent = await this.deliver(hash);
    return { sent, status: sent ? "sent" as const : "queued" as const, expiresAt, email: user.email.value, requestedBy: context.ip };
  }
  private async deliver(tokenHash?: string) {
    const delivery = await this.tokens.claimDelivery(tokenHash);
    if (!delivery) return false;
    try {
      await this.email.sendActivation(delivery);
      await this.tokens.finishDelivery(delivery.id, "accepted");
      return true;
    } catch {
      await this.tokens.finishDelivery(delivery.id, "pending").catch(() => undefined);
      return false;
    }
  }
  async retry(limit = 20) {
    try { this.ensureConfigured(); } catch { return { processed: 0, configured: false }; }
    let processed = 0;
    const deadline = Date.now() + 40_000;
    while (processed < Math.min(20, Math.max(1, limit)) && Date.now() < deadline && await this.deliver()) {
      processed++;
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    return { processed, configured: true };
  }
  async activate(token: string, password: string) {
    if (typeof token !== "string" || token.length < 40 || token.length > 200) throw new ValidationError("Enlace de activación no válido", "token");
    if (!isValidAccountPassword(password)) throw new ValidationError(ACCOUNT_PASSWORD_REQUIREMENTS, "password");
    const hash = await tokenHash(token); const record = await this.tokens.findValid(hash, new Date());
    if (!record) throw new ConflictError("El enlace ha caducado, ya se utilizó o no es válido");
    const user = await this.users.findById(record.userId); if (!user) throw new ConflictError("La invitación ya no está disponible");
    const passwordHash = await bcryptHash(password);
    await this.tokens.complete(hash, passwordHash);
  }
}

// The concrete bcrypt adapter is injected indirectly through the user repository in the
// rest of the application; this small port keeps activation independent of HTTP.
let passwordHasher: ((value: string) => Promise<string>) | null = null;
export function configureActivationPasswordHasher(hasher: (value: string) => Promise<string>) { passwordHasher = hasher; }
async function bcryptHash(password: string) { if (!passwordHasher) throw new Error("Password hasher is not configured"); return passwordHasher(password); }
