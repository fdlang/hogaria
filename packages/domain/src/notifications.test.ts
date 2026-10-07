import { describe, expect, it } from "vitest";
import { buildNotificationIntents, NOTIFICATION_COPY, type NotificationSourceEvent } from "./notifications.js";

const source = (changes: Partial<NotificationSourceEvent>): NotificationSourceEvent => ({
  id: "10000000-0000-4000-8000-000000000001", kind: "project_updated", actorId: 9, actorRole: "admin",
  occurredAt: "2026-10-07T12:00:00.000Z", resourceType: "project", resourceId: "7", projectId: 7,
  admins: [9, 10], clientId: 2, professionalIds: [3, 4], ...changes,
});

describe("notification audience policy", () => {
  it("routes project updates without notifying the actor or duplicating assignments", () => {
    expect(buildNotificationIntents(source({ addedProfessionalIds: [4] }))).toEqual([
      expect.objectContaining({ recipientId: 2, type: "project_updated", email: true }),
      expect.objectContaining({ recipientId: 3, type: "project_updated", email: true }),
      expect.objectContaining({ recipientId: 4, type: "project_assigned", email: true }),
    ]);
  });
  it("keeps reserved documents private and limits technical documents to assigned users", () => {
    const reserved = buildNotificationIntents(source({ kind: "document_uploaded", resourceType: "file", classification: "reservado" }));
    expect(reserved.map(item => item.recipientId)).toEqual([10]);
    const technical = buildNotificationIntents(source({ kind: "document_uploaded", resourceType: "file", classification: "tecnico" }));
    expect(technical.map(item => item.recipientId)).toEqual([10, 2, 3, 4]);
  });
  it("keeps commercial and workforce notices inside their role boundary", () => {
    expect(buildNotificationIntents(source({ kind: "estimate_published", resourceType: "estimate" }))).toEqual([expect.objectContaining({ recipientId: 2, type: "estimate_published" })]);
    expect(buildNotificationIntents(source({ kind: "work_reviewed", resourceType: "work_entry", professionalId: 3 }))).toEqual([expect.objectContaining({ recipientId: 3, type: "work_reviewed" })]);
  });
  it("uses closed, non-sensitive copy for every notification type", () => {
    for (const copy of Object.values(NOTIFICATION_COPY)) {
      expect(copy.title).not.toMatch(/[<>]/);
      expect(copy.summary).not.toMatch(/contraseña|dirección IP|coste|tarifa/i);
    }
  });
});
