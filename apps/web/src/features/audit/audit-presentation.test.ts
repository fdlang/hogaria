import { describe, expect, it } from "vitest";
import type { AuditEntryDTO } from "./api/audit.api";
import { auditActionLabel, auditDescription, isTechnicalAudit } from "./audit-presentation";

const entry = (action: string, details: Record<string, unknown>): AuditEntryDTO => ({
  id: "audit-1",
  action,
  details,
  userId: 1,
  userName: "admin",
  timestamp: "2026-09-20T20:11:32.000Z",
  ip: "127.0.0.1",
  userAgent: "test",
});

describe("audit presentation", () => {
  it("explains a project update in business language", () => {
    const item = entry("PROYECTO_ACTUALIZADO", { projectId: 2, changedFields: ["estado"] });
    expect(auditActionLabel(item.action)).toBe("Proyecto actualizado");
    expect(auditDescription(item)).toBe("Se actualizó el proyecto #2: estado.");
  });

  it("identifies technical database events without exposing their code as title", () => {
    const item = entry("DB_CHANGE_ORDERS_UPDATE", { recordId: "11" });
    expect(isTechnicalAudit(item.action)).toBe(true);
    expect(auditActionLabel(item.action)).toBe("Registro técnico de base de datos");
    expect(auditDescription(item)).toBe("Control interno de actualización en órdenes de cambio, registro #11.");
  });

  it("provides a readable fallback for future business actions", () => {
    expect(auditActionLabel("CLIENTE_NOTIFICADO")).toBe("Cliente notificado");
    expect(auditDescription(entry("CLIENTE_NOTIFICADO", {}))).toBe("Se registró una acción del sistema.");
  });
});
