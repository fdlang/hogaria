import type { ITransactionalEmail } from "../../application/use-cases/account-activation.use-cases.js";
import { ServiceUnavailableError } from "@reformapro/domain/errors";

export class ResendTransactionalEmail implements ITransactionalEmail {
  constructor(private readonly apiKey: string | undefined, private readonly from: string | undefined) {}
  isConfigured() { return Boolean(this.apiKey && this.from); }
  async sendActivation(input: { to: string; name: string; activationUrl: string; expiresAt: Date }) {
    if (!this.apiKey || !this.from) throw new ServiceUnavailableError("El servicio de invitaciones no está disponible");
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: this.from, to: [input.to], subject: "Activa tu área cliente de Hogaria", html: `<div style="font-family:Arial,sans-serif;color:#302d29;max-width:560px;margin:auto"><img src="https://www.hogaria.design/brand/hogaria-wordmark.png" alt="Hogaria" width="190" style="display:block;margin-bottom:24px"/><p>Hola, ${escapeHtml(input.name)}:</p><p>Hemos preparado tu acceso privado para que puedas consultar propuestas y el avance de tu obra.</p><p><a href="${input.activationUrl}" style="display:inline-block;padding:12px 18px;background:#995637;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Crear mi contraseña</a></p><p style="color:#71685e;font-size:13px">El enlace es personal, se puede utilizar una sola vez y caduca el ${input.expiresAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}. Si no esperabas este mensaje, puedes ignorarlo.</p></div>` }) });
    } catch {
      throw new ServiceUnavailableError("No se pudo conectar con el servicio de invitaciones. Inténtalo de nuevo en unos minutos");
    }
    if (!response.ok) throw new ServiceUnavailableError("No se pudo enviar la invitación. Inténtalo de nuevo en unos minutos");
  }
}
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
