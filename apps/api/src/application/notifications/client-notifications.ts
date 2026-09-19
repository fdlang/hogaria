import type { DomainEvent, IEventEmitter } from "@reformapro/domain/events";
import type {
  IUserRepository,
  IProjectRepository,
  IEstimateRepository,
} from "@reformapro/domain/repositories";
import type { IFileRepository } from "../use-cases/file.use-cases.js";

export type NoticeKind = "estimate" | "document" | "project" | "project-update";
export type Notice = {
  id: string;
  clientId: number;
  kind: NoticeKind;
  resourceId: number;
};
export interface NoticeStore {
  enqueue(notice: Notice): Promise<void>;
  claim(id?: string): Promise<Notice | null>;
  finish(
    id: string,
    state: "accepted" | "skipped" | "pending",
    providerId?: string,
  ): Promise<void>;
}
export interface NoticeEmail {
  configured(): boolean;
  send(notice: Notice, to: string): Promise<string>;
}
// Explicit allowlist: internal commercial/workforce events never leave the API.
const types: DomainEvent["type"][] = [
  "EstimateSent",
  "EstimateAccepted",
  "FileUploaded",
  "ProjectUpdated",
];
export class ClientNotifications {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly estimates: IEstimateRepository,
    private readonly files: IFileRepository,
    private readonly store: NoticeStore,
    private readonly email: NoticeEmail,
    private readonly report: (code: string) => void = (code) =>
      console.error(code),
  ) {}
  start(events: IEventEmitter, transactionalOutbox = false) {
    const off = types.map((type) =>
      events.subscribe(type, async (event) => {
        try {
          if (transactionalOutbox) await this.retry(1);
          else await this.receive(event);
        } catch {
          this.report("CLIENT_NOTIFICATION_ENQUEUE_FAILED");
        }
      }),
    );
    return () => off.forEach((stop) => stop());
  }
  async receive(event: DomainEvent) {
    if (!types.includes(event.type)) return;
    const data = event as DomainEvent & {
      projectId?: number;
      estimateId?: number;
      fileId?: number;
    };
    let kind: NoticeKind, resourceId: number, clientId: number;
    if (event.type === "EstimateSent") {
      const estimate = await this.estimates.findById(Number(data.estimateId));
      if (!estimate || estimate.estado !== "enviado") return;
      kind = "estimate";
      resourceId = estimate.id;
      clientId = estimate.clienteId;
    } else {
      const project = await this.projects.findById(Number(data.projectId));
      if (!project) return;
      clientId = project.clienteId;
      kind =
        event.type === "FileUploaded"
          ? "document"
          : event.type === "EstimateAccepted"
            ? "project"
            : "project-update";
      resourceId = kind === "document" ? Number(data.fileId) : project.id;
      if (kind === "document") {
        const file = await this.files.findById(resourceId);
        if (!file || file.projectId !== project.id) return;
      }
    }
    // Do not email clients about their own uploads or actions.
    if (clientId === event.actorId) return;
    const client = await this.users.findById(clientId);
    if (!client?.activo || client.rol !== "cliente") return;
    const notice = { id: event.eventId, clientId, kind, resourceId };
    await this.store.enqueue(notice);
    if (this.email.configured()) await this.deliver(event.eventId);
    else this.report("CLIENT_NOTIFICATION_EMAIL_NOT_CONFIGURED");
  }
  private async recipient(notice: Notice) {
    const client = await this.users.findById(notice.clientId);
    if (!client?.activo || client.rol !== "cliente") return null;
    if (notice.kind === "estimate") {
      const estimate = await this.estimates.findById(notice.resourceId);
      if (
        !estimate ||
        estimate.clienteId !== client.id ||
        ["borrador", "en_revision"].includes(estimate.estado)
      )
        return null;
    } else {
      const file =
        notice.kind === "document"
          ? await this.files.findById(notice.resourceId)
          : null;
      if (notice.kind === "document" && !file) return null;
      const project = await this.projects.findById(
        file ? file.projectId : notice.resourceId,
      );
      if (!project || project.clienteId !== client.id) return null;
    }
    return client.email.value;
  }
  private async deliver(id?: string): Promise<boolean> {
    const notice = await this.store.claim(id);
    if (!notice) return false;
    try {
      const to = await this.recipient(notice);
      if (!to) {
        await this.store.finish(notice.id, "skipped");
        return true;
      }
      const providerId = await this.email.send(notice, to);
      await this.store.finish(notice.id, "accepted", providerId);
    } catch {
      this.report("CLIENT_NOTIFICATION_DELIVERY_FAILED");
      await this.store.finish(notice.id, "pending");
    }
    return true;
  }
  async retry(limit = 50) {
    if (!this.email.configured()) return { processed: 0, configured: false };
    let processed = 0;
    const deadline = Date.now() + 40_000;
    while (
      processed < Math.min(50, Math.max(1, limit)) &&
      Date.now() < deadline &&
      (await this.deliver())
    ) {
      processed++;
      // Stay below the provider's default two-requests-per-second limit.
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return { processed, configured: true };
  }
}
