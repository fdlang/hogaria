import type { UserRole } from "./entities/index.js";

export type AppNotificationType =
  | "request_submitted"
  | "estimate_published"
  | "estimate_signed"
  | "estimate_rejected"
  | "project_created"
  | "project_updated"
  | "project_assigned"
  | "project_unassigned"
  | "document_uploaded"
  | "change_order_sent"
  | "change_order_decided"
  | "work_submitted"
  | "work_reviewed"
  | "work_rate_changed";

export type NotificationResourceType = "request" | "estimate" | "project" | "file" | "change_order" | "work_entry" | "professional";

export interface NotificationSourceEvent {
  id: string;
  kind: AppNotificationType;
  actorId: number;
  actorRole?: UserRole | null;
  occurredAt: string;
  resourceType: NotificationResourceType;
  resourceId: string;
  projectId?: number;
  admins?: number[];
  clientId?: number | null;
  professionalId?: number | null;
  professionalIds?: number[];
  addedProfessionalIds?: number[];
  removedProfessionalIds?: number[];
  classification?: "publico" | "tecnico" | "contrato" | "factura" | "reservado";
}

export interface NotificationIntent {
  eventId: string;
  recipientId: number;
  type: AppNotificationType;
  priority: "normal" | "high";
  resourceType: NotificationResourceType;
  resourceId: string;
  projectId?: number;
  email: true;
  occurredAt: string;
}

const highPriority = new Set<AppNotificationType>(["estimate_published", "estimate_signed", "estimate_rejected", "change_order_sent", "change_order_decided", "work_reviewed"]);
const uniqueRecipients = (ids: Array<number | null | undefined>, actorId: number) => [...new Set(ids.filter((id): id is number => Number.isSafeInteger(id) && id! > 0 && id !== actorId))];

export function buildNotificationIntents(event: NotificationSourceEvent): NotificationIntent[] {
  const admins = event.admins ?? [], professionals = event.professionalIds ?? [];
  const added = event.addedProfessionalIds ?? [], removed = event.removedProfessionalIds ?? [];
  const intents: Array<{ recipientId: number; type: AppNotificationType }> = [];
  const add = (ids: Array<number | null | undefined>, type: AppNotificationType) => {
    for (const recipientId of uniqueRecipients(ids, event.actorId)) intents.push({ recipientId, type });
  };
  switch (event.kind) {
    case "request_submitted": add(admins, event.kind); break;
    case "estimate_published": add([event.clientId], event.kind); break;
    case "estimate_signed":
    case "estimate_rejected": add(admins, event.kind); break;
    case "project_created": add([event.clientId], event.kind); break;
    case "project_updated":
      add([event.clientId], event.kind);
      add(professionals.filter(id => !added.includes(id) && !removed.includes(id)), event.kind);
      if (event.actorRole === "profesional") add(admins, event.kind);
      add(added, "project_assigned");
      add(removed, "project_unassigned");
      break;
    case "project_assigned": add([event.professionalId], event.kind); break;
    case "project_unassigned": add([event.professionalId], event.kind); break;
    case "document_uploaded":
      add(admins, event.kind);
      if (event.classification !== "reservado") add([event.clientId], event.kind);
      if (["publico", "tecnico"].includes(event.classification ?? "reservado")) add(professionals, event.kind);
      break;
    case "change_order_sent": add([event.clientId], event.kind); break;
    case "change_order_decided": add(admins, event.kind); break;
    case "work_submitted": add(admins, event.kind); break;
    case "work_reviewed":
    case "work_rate_changed": add([event.professionalId], event.kind); break;
  }
  const deduplicated = new Map<string, { recipientId: number; type: AppNotificationType }>();
  for (const intent of intents) deduplicated.set(`${intent.recipientId}:${intent.type}`, intent);
  return [...deduplicated.values()].map(intent => ({
    eventId: event.id, recipientId: intent.recipientId, type: intent.type,
    priority: highPriority.has(intent.type) ? "high" : "normal",
    resourceType: event.resourceType, resourceId: event.resourceId,
    ...(event.projectId === undefined ? {} : { projectId: event.projectId }),
    email: true, occurredAt: event.occurredAt,
  }));
}

export const NOTIFICATION_COPY: Record<AppNotificationType, { title: string; summary: string }> = {
  request_submitted: { title: "Nueva solicitud", summary: "Hay una nueva solicitud comercial pendiente de revisar." },
  estimate_published: { title: "Nueva propuesta disponible", summary: "Tienes una propuesta disponible en tu área privada." },
  estimate_signed: { title: "Propuesta firmada", summary: "Un cliente ha firmado una propuesta." },
  estimate_rejected: { title: "Cambios solicitados", summary: "Un cliente ha solicitado cambios en una propuesta." },
  project_created: { title: "Obra disponible", summary: "Tu obra ya está disponible en el área privada." },
  project_updated: { title: "Novedades en una obra", summary: "Se ha actualizado información relevante de una obra." },
  project_assigned: { title: "Nueva obra asignada", summary: "Se te ha asignado una obra." },
  project_unassigned: { title: "Asignación finalizada", summary: "Ha finalizado una de tus asignaciones de obra." },
  document_uploaded: { title: "Nuevo documento", summary: "Se ha añadido documentación que puedes consultar." },
  change_order_sent: { title: "Orden de cambio pendiente", summary: "Tienes una orden de cambio pendiente de revisar." },
  change_order_decided: { title: "Orden de cambio respondida", summary: "Un cliente ha respondido a una orden de cambio." },
  work_submitted: { title: "Trabajo pendiente de revisión", summary: "Hay un registro de trabajo pendiente de revisar." },
  work_reviewed: { title: "Registro de trabajo revisado", summary: "Administración ha revisado uno de tus registros de trabajo." },
  work_rate_changed: { title: "Configuración de trabajo actualizada", summary: "Se ha actualizado tu configuración de trabajo." },
};
