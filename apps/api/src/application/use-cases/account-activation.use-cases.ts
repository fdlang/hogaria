import type { IUserRepository } from "@reformapro/domain/repositories";
import { ConflictError, ForbiddenError, ValidationError } from "@reformapro/domain/errors";
import type { ClientContext } from "./auth.use-cases.js";

export interface ActivationToken { userId: number; tokenHash: string; expiresAt: Date; usedAt: Date | null; }
export interface IActivationTokenRepository {
  replace(token: ActivationToken): Promise<void>;
  findValid(tokenHash: string, now: Date): Promise<ActivationToken | null>;
  /** Consume a still-valid link and activate its account in one transaction. */
  complete(tokenHash: string, passwordHash: string): Promise<void>;
}
export interface ITransactionalEmail { isConfigured(): boolean; sendActivation(input: { to: string; name: string; activationUrl: string; expiresAt: Date }): Promise<void>; }

const encoder = new TextEncoder();
const base64Url = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))
  .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const tokenHash = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))), byte => byte.toString(16).padStart(2, "0")).join("");
const newToken = () => base64Url(crypto.getRandomValues(new Uint8Array(32)));

export class AccountActivationUseCases {
  constructor(private readonly users: IUserRepository, private readonly tokens: IActivationTokenRepository, private readonly email: ITransactionalEmail, private readonly appUrl: string, private readonly ttlMs = 24 * 60 * 60 * 1000) {}
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
    this.ensureConfigured(); const actor = await this.users.findById(actorId); if (!actor || actor.rol !== "admin") throw new ForbiddenError();
    const user = await this.users.findById(userId);
    if (!user || (user.rol !== "cliente" && user.rol !== "profesional")) {
      throw new ValidationError("Solo se pueden invitar cuentas de cliente o profesional", "userId");
    }
    // Clients cannot receive a second activation once active. For professionals,
    // an admin may re-send the secure access link to recover accounts created
    // before the invitation flow existed.
    if (user.activo && user.rol !== "profesional") throw new ConflictError("La cuenta ya está activada");
    const token = newToken(); const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.tokens.replace({ userId: user.id, tokenHash: await tokenHash(token), expiresAt, usedAt: null });
    const activationUrl = `${this.appUrl.replace(/\/$/, "")}/#/activar-cuenta?token=${encodeURIComponent(token)}`;
    await this.email.sendActivation({ to: user.email.value, name: user.nombre, activationUrl, expiresAt });
    return { expiresAt, email: user.email.value, requestedBy: context.ip };
  }
  async activate(token: string, password: string) {
    if (typeof token !== "string" || token.length < 40 || token.length > 200) throw new ValidationError("Enlace de activación no válido", "token");
    if (typeof password !== "string" || encoder.encode(password).length > 72 || password.length < 12 || !/[a-z]/i.test(password) || !/\d/.test(password)) throw new ValidationError("Usa al menos 12 caracteres, incluyendo letras y números", "password");
    const hash = await tokenHash(token); const record = await this.tokens.findValid(hash, new Date());
    if (!record) throw new ConflictError("El enlace ha caducado, ya se utilizó o no es válido");
    const user = await this.users.findById(record.userId); if (!user || !["cliente", "profesional"].includes(user.rol)) throw new ConflictError("La invitación ya no está disponible");
    const passwordHash = await bcryptHash(password);
    await this.tokens.complete(hash, passwordHash);
  }
}

// The concrete bcrypt adapter is injected indirectly through the user repository in the
// rest of the application; this small port keeps activation independent of HTTP.
let passwordHasher: ((value: string) => Promise<string>) | null = null;
export function configureActivationPasswordHasher(hasher: (value: string) => Promise<string>) { passwordHasher = hasher; }
async function bcryptHash(password: string) { if (!passwordHasher) throw new Error("Password hasher is not configured"); return passwordHasher(password); }
