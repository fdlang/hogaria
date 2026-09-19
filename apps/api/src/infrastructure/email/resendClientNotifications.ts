import type {
  Notice,
  NoticeEmail,
} from "../../application/notifications/client-notifications.js";
const messages = {
  estimate:
    "Tienes un nuevo presupuesto disponible. Puedes consultarlo y descargar su PDF desde tu área privada.",
  document:
    "Se ha añadido documentación a tu obra. Accede a tu área privada para consultarla.",
  project:
    "Tu obra ya está disponible en tu área privada. Puedes consultar su planificación y seguimiento.",
  "project-update":
    "Se han actualizado datos del seguimiento de tu obra. Accede a tu área privada para consultar las novedades.",
};
export class ResendClientNotifications implements NoticeEmail {
  constructor(
    private readonly key: string | undefined,
    private readonly from: string | undefined,
    private readonly appUrl: string | undefined,
  ) {}
  configured() {
    if (!this.key || !this.from || !this.appUrl) return false;
    try {
      const url = new URL(this.appUrl);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  async send(notice: Notice, to: string) {
    if (!this.configured())
      throw new Error("Notification email not configured");
    // No attachments, file URLs, amounts, names or customer text in transactional notices.
    const url = new URL("/#/cliente", this.appUrl!).href;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `client-notice/${notice.id}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject: "Novedades en tu área cliente · Hogaria",
        text: `Hola:\n\n${messages[notice.kind]}\n\nAcceder a mi cuenta: ${url}\n\nPor seguridad, tendrás que iniciar sesión. Este aviso no incluye documentos adjuntos.\n\nHogaria · Reformas integrales e interiorismo\n614 786 341 · info@hogaria.design`,
      }),
    });
    if (!response.ok) throw new Error("Notification provider rejected request");
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("Missing provider receipt");
    return body.id;
  }
}
