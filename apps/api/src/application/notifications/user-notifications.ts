import {
  buildNotificationIntents,
  NOTIFICATION_COPY,
  type AppNotificationType,
  type NotificationIntent,
  type NotificationResourceType,
  type NotificationSourceEvent,
} from "@reformapro/domain";
import { ForbiddenError, NotFoundError } from "@reformapro/domain/errors";
import type { IEstimateRepository, IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import type { IFileRepository } from "../use-cases/file.use-cases.js";
import type { UserRole } from "@reformapro/domain/entities";

export interface NotificationOutboxEvent {
  id: string;
  kind: AppNotificationType;
  actorId: number;
  resourceType: NotificationResourceType;
  resourceId: string;
  projectId?: number;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface StoredUserNotification extends NotificationIntent {
  id: string;
  readAt: string | null;
  emailState: "pending" | "sending" | "accepted" | "skipped" | "failed";
}

export interface UserNotificationStore {
  claimEvent(): Promise<NotificationOutboxEvent | null>;
  insertIntents(intents: NotificationIntent[]): Promise<void>;
  finishEvent(id: string, state: "processed" | "pending" | "failed", reason?: string): Promise<void>;
  list(recipientId: number, cursor: string | undefined, limit: number): Promise<{ items: StoredUserNotification[]; nextCursor: string | null }>;
  unreadCount(recipientId: number): Promise<number>;
  markRead(id: string, recipientId: number): Promise<boolean>;
  markAllRead(recipientId: number): Promise<number>;
  claimEmail(): Promise<StoredUserNotification | null>;
  finishEmail(id: string, state: "accepted" | "skipped" | "pending", providerId?: string, reason?: string): Promise<void>;
}

export interface UserNotificationEmail {
  configured(): boolean;
  send(input: { notificationId: string; to: string; name: string; role: UserRole; type: AppNotificationType }): Promise<string>;
}

export interface NotificationDTO {
  id: string;
  type: AppNotificationType;
  title: string;
  summary: string;
  priority: "normal" | "high";
  resourceType: NotificationResourceType;
  resourceId: string;
  projectId?: number;
  createdAt: string;
  readAt: string | null;
}

const integerArray = (value: unknown): number[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is number => Number.isSafeInteger(item) && item > 0))]
  : [];
const positiveInteger = (value: unknown): number | undefined => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

export class UserNotifications {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly estimates: IEstimateRepository,
    private readonly files: IFileRepository,
    private readonly store: UserNotificationStore,
    private readonly email: UserNotificationEmail,
    private readonly report: (code: string) => void = code => console.error(code),
  ) {}

  private async hydrate(raw: NotificationOutboxEvent): Promise<NotificationSourceEvent> {
    const admins = (await this.users.findByRole("admin")).filter(user => user.activo).map(user => user.id);
    const actor = raw.actorId > 0 ? await this.users.findById(raw.actorId) : null;
    const event: NotificationSourceEvent = {
      id: raw.id, kind: raw.kind, actorId: raw.actorId, actorRole: actor?.rol ?? null,
      occurredAt: raw.occurredAt, resourceType: raw.resourceType, resourceId: raw.resourceId,
      ...(raw.projectId === undefined ? {} : { projectId: raw.projectId }), admins,
    };
    if (raw.kind.startsWith("estimate_")) {
      const estimate = await this.estimates.findById(Number(raw.resourceId));
      if (!estimate) throw new NotFoundError("Presupuesto");
      event.clientId = estimate.clienteId;
      return event;
    }
    if (raw.resourceType === "project" || raw.resourceType === "file" || raw.resourceType === "change_order") {
      let projectId = raw.projectId;
      if (raw.resourceType === "file") {
        const file = await this.files.findById(Number(raw.resourceId));
        if (!file) throw new NotFoundError("Archivo");
        projectId = file.projectId;
        event.classification = file.classification ?? "reservado";
      }
      if (!projectId) throw new NotFoundError("Proyecto");
      const project = await this.projects.findById(projectId);
      if (!project) throw new NotFoundError("Proyecto");
      event.projectId = project.id;
      if (raw.payload.clientVisible !== false) event.clientId = project.clienteId;
      event.professionalIds = project.profesionalesAsignados.map(item => item.userId);
      event.addedProfessionalIds = integerArray(raw.payload.addedProfessionalIds);
      event.removedProfessionalIds = integerArray(raw.payload.removedProfessionalIds);
      return event;
    }
    const professionalId = positiveInteger(raw.payload.professionalId);
    if (professionalId !== undefined) event.professionalId = professionalId;
    return event;
  }

  async processPending(limit = 25): Promise<number> {
    let processed = 0;
    while (processed < Math.max(1, Math.min(limit, 50))) {
      const raw = await this.store.claimEvent();
      if (!raw) break;
      try {
        const source = await this.hydrate(raw);
        const intents = buildNotificationIntents(source);
        const activeIntents: NotificationIntent[] = [];
        for (const intent of intents) {
          const recipient = await this.users.findById(intent.recipientId);
          if (recipient?.activo) activeIntents.push(intent);
        }
        await this.store.insertIntents(activeIntents);
        await this.store.finishEvent(raw.id, "processed");
      } catch (error) {
        if (error instanceof NotFoundError) await this.store.finishEvent(raw.id, "failed", "resource_not_found");
        else {
          this.report("APP_NOTIFICATION_PROCESSING_FAILED");
          await this.store.finishEvent(raw.id, "pending", "processing_failed");
        }
      }
      processed++;
    }
    return processed;
  }

  async list(actorId: number, cursor?: string, limit = 20) {
    await this.requireActive(actorId);
    await this.processPending(10).catch(() => this.report("APP_NOTIFICATION_FAST_PATH_FAILED"));
    const page = await this.store.list(actorId, cursor, Math.max(1, Math.min(limit, 25)));
    return { ...page, items: page.items.map(item => this.toDTO(item)) };
  }

  async unreadCount(actorId: number) {
    await this.requireActive(actorId);
    await this.processPending(10).catch(() => this.report("APP_NOTIFICATION_FAST_PATH_FAILED"));
    return this.store.unreadCount(actorId);
  }

  async markRead(actorId: number, id: string) {
    await this.requireActive(actorId);
    if (!await this.store.markRead(id, actorId)) throw new NotFoundError("Notificación");
  }

  async markAllRead(actorId: number) {
    await this.requireActive(actorId);
    return this.store.markAllRead(actorId);
  }

  async retry(limit = 50) {
    const events = await this.processPending(limit);
    if (!this.email.configured()) return { events, emails: 0, configured: false };
    let emails = 0;
    const deadline = Date.now() + 40_000;
    while (emails < Math.max(1, Math.min(limit, 50)) && Date.now() < deadline) {
      const notification = await this.store.claimEmail();
      if (!notification) break;
      try {
        const recipient = await this.users.findById(notification.recipientId);
        if (!recipient?.activo) await this.store.finishEmail(notification.id, "skipped", undefined, "recipient_inactive");
        else {
          const providerId = await this.email.send({ notificationId: notification.id, to: recipient.email.value, name: recipient.nombre, role: recipient.rol, type: notification.type });
          await this.store.finishEmail(notification.id, "accepted", providerId);
        }
      } catch {
        this.report("APP_NOTIFICATION_EMAIL_FAILED");
        await this.store.finishEmail(notification.id, "pending", undefined, "delivery_failed");
      }
      emails++;
      if (emails < limit) await new Promise(resolve => setTimeout(resolve, 600));
    }
    return { events, emails, configured: true };
  }

  private async requireActive(actorId: number) {
    const actor = await this.users.findById(actorId);
    if (!actor?.activo) throw new ForbiddenError();
    return actor;
  }

  private toDTO(item: StoredUserNotification): NotificationDTO {
    const copy = NOTIFICATION_COPY[item.type];
    return {
      id: item.id, type: item.type, title: copy.title, summary: copy.summary,
      priority: item.priority, resourceType: item.resourceType, resourceId: item.resourceId,
      ...(item.projectId === undefined ? {} : { projectId: item.projectId }),
      createdAt: item.occurredAt, readAt: item.readAt,
    };
  }
}
