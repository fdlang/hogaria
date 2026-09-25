import type { Notice, NoticeEmail } from "../../application/notifications/client-notifications.js";

const messages = {
  estimate: "Tienes un nuevo presupuesto disponible. Puedes consultarlo y descargar su PDF desde tu \u00e1rea privada.",
  document: "Se ha a\u00f1adido documentaci\u00f3n a tu obra. Accede a tu \u00e1rea privada para consultarla.",
  project: "Tu obra ya est\u00e1 disponible en tu \u00e1rea privada. Puedes consultar su planificaci\u00f3n y seguimiento.",
  "project-update": "Se han actualizado datos del seguimiento de tu obra. Accede a tu \u00e1rea privada para consultar las novedades.",
  "lead-confirmation": "Hemos recibido tu solicitud. Nuestro equipo la revisar\u00e1 y se pondr\u00e1 en contacto contigo para explicarte los siguientes pasos.",
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
    if (!this.configured()) throw new Error("Notification email not configured");
    const isLead = notice.kind === "lead-confirmation";
    const url = new URL(isLead ? "/" : "/#/cliente", this.appUrl!).href;
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
        subject: isLead ? "Hemos recibido tu solicitud \u00b7 Hogaria" : "Novedades en tu \u00e1rea cliente \u00b7 Hogaria",
        text: isLead
          ? `Hola:\n\n${messages[notice.kind]}\n\nConocer Hogaria: ${url}\n\nHogaria \u00b7 Reformas integrales e interiorismo\n614 786 341 \u00b7 info@hogaria.design`
          : `Hola:\n\n${messages[notice.kind]}\n\nAcceder a mi cuenta: ${url}\n\nPor seguridad, tendr\u00e1s que iniciar sesi\u00f3n. Este aviso no incluye documentos adjuntos.\n\nHogaria \u00b7 Reformas integrales e interiorismo\n614 786 341 \u00b7 info@hogaria.design`,
      }),
    });
    if (!response.ok) throw new Error("Notification provider rejected request");
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("Missing provider receipt");
    return body.id;
  }
}
