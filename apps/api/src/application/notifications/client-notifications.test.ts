import { describe, it, expect, vi } from "vitest";
import type { DomainEvent } from "@reformapro/domain/events";
import { ClientNotifications } from "./client-notifications.js";
import { MemoryNoticeStore } from "../../infrastructure/database/clientNoticeStore.js";
import { ResendClientNotifications } from "../../infrastructure/email/resendClientNotifications.js";
import { InMemoryEventEmitter } from "../../infrastructure/events/inMemoryEventEmitter.js";
import { UpdateProjectUseCase } from "../use-cases/project.use-cases.js";
function fixture() {
  const users = {
    findById: vi.fn(async (id: number) => ({
      id,
      rol: id === 9 ? "admin" : "cliente",
      activo: true,
      email: { value: `client${id}@test.es` },
    })),
  };
  const projects = {
    findById: vi.fn(async () => ({
      id: 10,
      clienteId: 1,
      estado: "planificacion",
      progreso: 0,
      fechaInicio: new Date("2026-10-01"),
      fechaFinPrevista: new Date("2026-10-31"),
      profesionalesAsignados: [2],
      hitos: [{ id: "h1", nombre: "Inicio", completado: false }],
    })),
    update: vi.fn(),
  };
  const estimates = {
    findById: vi.fn(async () => ({ id: 20, clienteId: 1, estado: "enviado" })),
  };
  const files = { findById: vi.fn(async () => ({ id: 30, projectId: 10, classification: "publico" })) };
  const solicitudes = { findById: vi.fn(async () => ({ id: 40, email: "lead@test.es" })) };
  const mail = { configured: () => true, send: vi.fn(async () => "receipt") },
    store = new MemoryNoticeStore(),
    report = vi.fn();
  const service = new ClientNotifications(
    users as never,
    projects as never,
    estimates as never,
    files as never,
    solicitudes as never,
    store,
    mail,
    report,
  );
  return { users, projects, estimates, files, solicitudes, mail, store, service, report };
}
function event(
  type: DomainEvent["type"],
  extra: Record<string, unknown> = {},
): DomainEvent {
  return {
    type,
    eventId: crypto.randomUUID(),
    actorId: 9,
    actorName: "Admin",
    occurredAt: new Date(),
    projectId: 10,
    fileId: 30,
    estimateId: 20,
    ...extra,
  } as DomainEvent;
}
describe("Client notification privacy and delivery", () => {
  it("notifies only the owner about published estimates, files, project creation and changes", async () => {
    const f = fixture();
    for (const type of [
      "EstimateSent",
      "FileUploaded",
      "EstimateAccepted",
      "ProjectUpdated",
    ] as const)
      await f.service.receive(event(type));
    expect(f.mail.send).toHaveBeenCalledTimes(4);
    for (const [notice, to] of f.mail.send.mock.calls) {
      expect(to).toBe("client1@test.es");
      expect(notice).not.toHaveProperty("payload");
    }
  });
  it("ignores internal events, own uploads, inactive clients and drafts", async () => {
    const f = fixture();
    await f.service.receive(event("EstimateCreated"));
    await f.service.receive(event("FileUploaded", { actorId: 1 }));
    f.estimates.findById.mockResolvedValue({
      id: 20,
      clienteId: 1,
      estado: "borrador",
    });
    await f.service.receive(event("EstimateSent"));
    f.users.findById.mockResolvedValue({
      id: 1,
      rol: "cliente",
      activo: false,
      email: { value: "client1@test.es" },
    });
    await f.service.receive(event("ProjectUpdated"));
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it("deduplicates repeated/concurrent event delivery", async () => {
    const f = fixture(),
      e = event("FileUploaded");
    await Promise.all([f.service.receive(e), f.service.receive(e)]);
    await f.service.receive(e);
    expect(f.mail.send).toHaveBeenCalledTimes(1);
  });
  it("never notifies a client about a reserved document", async () => {
    const f = fixture();
    f.files.findById.mockResolvedValue({ id: 30, projectId: 10, classification: "reservado" });
    await f.service.receive(event("FileUploaded"));
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it("confirms a saved public request without requiring a client account", async () => {
    const f = fixture();
    await f.service.receiveLead(40, "00000000-0000-4000-8000-000000000040");
    expect(f.mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "lead-confirmation", resourceId: 40 }),
      "lead@test.es",
    );
  });
  it("persists a failed delivery, waits before retry and rechecks ownership", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.mail.send.mockRejectedValueOnce(new Error("provider down"));
      await f.service.receive(event("FileUploaded"));
      expect(f.report).toHaveBeenCalledWith(
        "CLIENT_NOTIFICATION_DELIVERY_FAILED",
      );
      expect((await f.service.retry()).processed).toBe(0);
      vi.advanceTimersByTime(16 * 60 * 1000);
      f.projects.findById.mockResolvedValue({
        id: 10,
        clienteId: 2,
        estado: "planificacion",
        progreso: 0,
      });
      const retry = f.service.retry();
      await vi.runAllTimersAsync();
      expect((await retry).processed).toBe(1);
      expect(f.mail.send).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("retries temporary failure successfully without failing the business event", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(),
        bus = new InMemoryEventEmitter();
      f.service.start(bus);
      f.mail.send.mockRejectedValueOnce(new Error("down"));
      await expect(bus.emit(event("EstimateSent"))).resolves.toBeUndefined();
      vi.advanceTimersByTime(16 * 60 * 1000);
      const retry = f.service.retry();
      await vi.runAllTimersAsync();
      await retry;
      expect(f.mail.send).toHaveBeenCalledTimes(2);
      expect(f.mail.send.mock.calls[0]).toEqual(f.mail.send.mock.calls[1]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("only emits ProjectUpdated for real visible changes, not empty or unchanged fields", async () => {
    const f = fixture(),
      events = { emit: vi.fn(async () => {}), subscribe: vi.fn() };
    const uc = new UpdateProjectUseCase(
      f.users as never,
      f.projects as never,
      events,
    );
    const base = {
      actorId: 9,
      projectId: 10,
      ctx: { ip: "test", userAgent: "test" },
    };
    await uc.execute({ ...base, changes: { estado: "planificacion" } });
    await uc.execute({ ...base, changes: {} });
    expect(events.emit).not.toHaveBeenCalled();
    await uc.execute({ ...base, changes: { estado: "en_curso" } });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ProjectUpdated",
        changedFields: ["estado"],
      }),
    );
  });
  it("uses a generic authenticated-area link and never attaches documents", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetcher);
    try {
      const mail = new ResendClientNotifications(
        "key",
        "info@hogaria.test",
        "https://hogaria.test",
      );
      await mail.send(
        { id: "notice", clientId: 1, kind: "estimate", resourceId: 20 },
        "client1@test.es",
      );
      const payload = JSON.parse(fetcher.mock.calls[0]![1].body);
      expect(payload).not.toHaveProperty("attachments");
      expect(payload.text).toContain("https://hogaria.test/#/cliente");
      expect(payload.text).not.toContain("token=");
      expect(
        new ResendClientNotifications(
          "key",
          "from",
          "http://hogaria.test",
        ).configured(),
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not direct a lead without an account to the private area", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetcher);
    try {
      const mail = new ResendClientNotifications("key", "info@hogaria.test", "https://hogaria.test");
      await mail.send({ id: "lead", kind: "lead-confirmation", resourceId: 40 }, "lead@test.es");
      const payload = JSON.parse(fetcher.mock.calls[0]![1].body);
      expect(payload.text).not.toContain("#/cliente");
      expect(payload.text).not.toContain("iniciar sesi");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
