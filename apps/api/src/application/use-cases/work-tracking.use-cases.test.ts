import { describe, it, expect, vi } from "vitest";
import { Email, Money, Percentage } from "@reformapro/domain/value-objects";
import { workSeconds } from "@reformapro/domain";
import {
  InMemoryUserRepository,
  InMemoryProjectRepository,
} from "../../infrastructure/database/inMemoryRepositories.js";
import { MemoryWorkStore } from "../../infrastructure/database/memoryWorkStore.js";
import { WorkTrackingUseCases } from "./work-tracking.use-cases.js";

async function setup() {
  const users = new InMemoryUserRepository({
      hash: async (x) => x,
      verify: async () => true,
    }),
    projects = new InMemoryProjectRepository(),
    store = new MemoryWorkStore();
  for (const [id, rol] of [
    [1, "admin"],
    [2, "profesional"],
    [3, "profesional"],
    [4, "cliente"],
  ] as const)
    await users.save({
      id,
      rol,
      email: Email.of(`u${id}@test.es`),
      nombre: `Persona ${id}`,
      activo: true,
      createdAt: new Date(),
    });
  const project = await projects.save({
    id: 1,
    estimateId: 1,
    nombre: "Obra",
    descripcion: "",
    clienteId: 4,
    direccion: "Madrid",
    tipo: "Reforma",
    estado: "en_curso",
    progreso: Percentage.zero(),
    presupuesto: Money.of(1000),
    fechaInicio: new Date(),
    fechaFinPrevista: new Date(),
    profesionalesAsignados: [{ userId: 2 }, { userId: 3 }],
    hitos: [],
    createdAt: new Date(),
  });
  let time = "2026-09-19T08:00:00.000Z";
  const work = new WorkTrackingUseCases(
    users,
    projects,
    store,
    () => new Date(time),
  );
  await work.configure(1, 2, {
    engagement: "empleado",
    rateUnit: "hora",
    rateCents: 2000,
    reason: "Alta inicial",
    effectiveAt: "2026-09-01T00:00:00Z",
  });
  await work.configure(1, 3, {
    engagement: "autonomo",
    rateUnit: "unidad",
    rateCents: 1500,
    unitLabel: "metro",
    reason: "Alta inicial",
    effectiveAt: "2026-09-01T00:00:00Z",
  });
  const start = () =>
    work.start(2, { projectId: 1, operationId: crypto.randomUUID() });
  return {
    users,
    projects,
    store,
    work,
    project,
    start,
    at: (next: string) => {
      time = next;
    },
  };
}
describe("work tracking isolation and lifecycle", () => {
  it("subtracts pauses, freezes the cost and audits each transition", async () => {
    const s = await setup();
    let e = await s.start();
    s.at("2026-09-19T09:00:00Z");
    e = await s.work.action(2, e.id, { action: "pausa", revision: e.revision });
    s.at("2026-09-19T09:30:00Z");
    e = await s.work.action(2, e.id, {
      action: "reanudar",
      revision: e.revision,
    });
    s.at("2026-09-19T10:00:00Z");
    e = await s.work.action(2, e.id, {
      action: "salida",
      revision: e.revision,
    });
    expect(workSeconds(e)).toBe(5400);
    await s.work.action(1, e.id, { action: "aprobar", revision: e.revision });
    expect((await s.work.summary(1, 1)).approvedCostCents).toBe(3000);
    expect(await s.work.history(1, e.id)).toHaveLength(5);
    expect(JSON.stringify(await s.work.history(2, e.id))).not.toContain(
      "rateCents",
    );
    expect(JSON.stringify(await s.work.list(2, {}))).not.toContain(
      "approvedCostCents",
    );
  });
  it("separates tariff or correction authorship from approval when another admin exists", async () => {
    const s = await setup();
    await s.users.save({
      id: 5,
      rol: "admin",
      email: Email.of("u5@test.es"),
      nombre: "Persona 5",
      activo: true,
      createdAt: new Date(),
    });
    let entry = await s.start();
    s.at("2026-09-19T10:00:00Z");
    entry = await s.work.action(2, entry.id, { action: "salida", revision: entry.revision });
    await expect(s.work.action(1, entry.id, { action: "aprobar", revision: entry.revision }))
      .rejects.toThrow("otro administrador");
    await expect(s.work.action(5, entry.id, { action: "aprobar", revision: entry.revision }))
      .resolves.toMatchObject({ status: "aprobado", approvedBy: 5 });
  });
  it("serializes simultaneous clock-ins and makes retries idempotent", async () => {
    const s = await setup(),
      operationId = crypto.randomUUID();
    const [a, b] = await Promise.all([
      s.work.start(2, { projectId: 1, operationId }),
      s.work.start(2, { projectId: 1, operationId }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await s.work.history(1, a.id)).toHaveLength(1);
    await expect(s.start()).rejects.toThrow("abierta");
  });
  it("accepts only one of two concurrent revisions", async () => {
    const s = await setup(),
      e = await s.start();
    s.at("2026-09-19T09:00:00Z");
    const results = await Promise.allSettled([
      s.work.action(2, e.id, { action: "salida", revision: 1 }),
      s.work.action(2, e.id, { action: "salida", revision: 1 }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("blocks other professionals and clients from records, history and costs", async () => {
    const s = await setup(),
      e = await s.start();
    await expect(
      s.work.action(3, e.id, { action: "salida", revision: 1 }),
    ).rejects.toThrow();
    await expect(s.work.history(3, e.id)).rejects.toThrow();
    expect((await s.work.list(3, { professionalId: 2 })).total).toBe(0);
    for (const id of [3, 4]) {
      await expect(s.work.summary(id, 1)).rejects.toThrow();
      await expect(s.work.rates(id, 2)).rejects.toThrow();
      await expect(s.work.configure(id, 2, {})).rejects.toThrow();
      await expect(s.work.budget(id, 1, {})).rejects.toThrow();
      await expect(s.work.auditLog(id, 0)).rejects.toThrow();
    }
    await expect(s.work.list(4, {})).rejects.toThrow();
    await expect(s.work.current(4)).rejects.toThrow();
    await expect(
      s.work.action(2, e.id, { action: "aprobar", revision: 1 }),
    ).rejects.toThrow();
    await expect(
      s.work.start(2, { projectId: 999, operationId: crypto.randomUUID() }),
    ).rejects.toThrow();
  });
  it("rolls back the entry if its audit cannot be written", async () => {
    const s = await setup();
    vi.spyOn(s.store, "event").mockRejectedValueOnce(
      new Error("Audit offline"),
    );
    await expect(s.start()).rejects.toThrow("Audit offline");
    expect(await s.store.openEntry(2)).toBeNull();
  });
  it("blocks inactive accounts and paused projects", async () => {
    const s = await setup();
    await s.users.update(2, { activo: false });
    await expect(s.start()).rejects.toThrow();
    await s.users.update(2, { activo: true });
    await s.projects.update(1, { estado: "pausado" });
    await expect(s.start()).rejects.toThrow();
  });
  it("closes an open pause on exit", async () => {
    const s = await setup();
    let e = await s.start();
    s.at("2026-09-19T09:00:00Z");
    e = await s.work.action(2, e.id, { action: "pausa", revision: 1 });
    s.at("2026-09-19T09:30:00Z");
    e = await s.work.action(2, e.id, {
      action: "salida",
      revision: e.revision,
    });
    expect(workSeconds(e)).toBe(3600);
  });
  it("costs external parts by units and rejects overlapping or future work", async () => {
    const s = await setup();
    const part = {
      projectId: 1,
      operationId: crypto.randomUUID(),
      startedAt: "2026-09-18T08:00:00Z",
      endedAt: "2026-09-18T12:00:00Z",
      breakMinutes: 30,
      units: 2.5,
    };
    const e = await s.work.part(3, part);
    await s.work.action(1, e.id, { action: "aprobar", revision: 1 });
    expect((await s.work.summary(1, 1)).approvedCostCents).toBe(3750);
    expect((await s.work.part(3, part)).id).toBe(e.id);
    await expect(
      s.work.part(3, { ...part, operationId: crypto.randomUUID() }),
    ).rejects.toThrow("solapa");
    await expect(
      s.work.part(3, {
        ...part,
        operationId: crypto.randomUUID(),
        endedAt: "2026-09-20T12:00:00Z",
      }),
    ).rejects.toThrow();
    await expect(
      s.work.start(3, { projectId: 1, operationId: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      s.work.part(2, { ...part, operationId: crypto.randomUUID() }),
    ).rejects.toThrow();
  });
  it("corrections invalidate approval without rewriting the original tariff", async () => {
    const s = await setup();
    let e = await s.start();
    s.at("2026-09-19T10:00:00Z");
    e = await s.work.action(2, e.id, { action: "salida", revision: 1 });
    e = await s.work.action(1, e.id, { action: "aprobar", revision: 2 });
    await s.work.configure(1, 2, {
      engagement: "empleado",
      rateUnit: "hora",
      rateCents: 4000,
      reason: "Revisión coste",
    });
    e = await s.work.action(1, e.id, {
      action: "corregir",
      revision: e.revision,
      startedAt: e.startedAt,
      endedAt: "2026-09-19T09:00:00Z",
      reason: "Salida incorrecta",
    });
    expect((await s.work.summary(1, 1)).approvedCostCents).toBe(0);
    await s.work.action(1, e.id, { action: "aprobar", revision: e.revision });
    expect((await s.work.summary(1, 1)).approvedCostCents).toBe(2000);
    expect(await s.work.rates(1, 2)).toHaveLength(2);
  });
  it("requires a rejection reason and blocks tariff changes during an open shift", async () => {
    const s = await setup();
    const e = await s.start();
    await expect(
      s.work.configure(1, 2, {
        engagement: "empleado",
        rateUnit: "hora",
        rateCents: 3000,
        reason: "Cambio",
      }),
    ).rejects.toThrow("Cierra");
    s.at("2026-09-19T09:00:00Z");
    await s.work.action(2, e.id, { action: "salida", revision: 1 });
    await expect(
      s.work.action(1, e.id, { action: "rechazar", revision: 2 }),
    ).rejects.toThrow();
    await s.work.action(1, e.id, {
      action: "rechazar",
      revision: 2,
      reason: "Revisar horas",
    });
    expect((await s.work.summary(1, 1)).approvedCostCents).toBe(0);
  });
  it("compares approved labour with a planned budget", async () => {
    const s = await setup();
    await s.work.budget(1, 1, {
      plannedHours: 10,
      plannedCostCents: 20000,
      reason: "Previsión inicial",
    });
    expect(await s.work.summary(1, 1)).toMatchObject({
      hoursDeviation: -10,
      costDeviationCents: -20000,
    });
    expect((await s.work.auditLog(1, 0)).items[0]).toMatchObject({
      action: "prevision_actualizada",
      reason: "Previsión inicial",
    });
  });
  it("validates IDs, dates, quantities and monetary precision", async () => {
    const s = await setup();
    for (const rateCents of [-1, NaN, Infinity, 1.5])
      await expect(
        s.work.configure(1, 2, {
          engagement: "empleado",
          rateUnit: "hora",
          rateCents,
          reason: "Test",
        }),
      ).rejects.toThrow();
    for (const page of [-1, 1.5, NaN])
      await expect(s.work.list(1, { page })).rejects.toThrow();
    await expect(s.work.list(1, { from: "invalid" })).rejects.toThrow();
    await expect(
      s.work.start(2, { projectId: 1, operationId: "not-uuid" }),
    ).rejects.toThrow();
  });
  it("allows finishing after unassignment but prevents another entry", async () => {
    const s = await setup(),
      e = await s.start();
    await s.projects.update(1, { profesionalesAsignados: [] });
    s.at("2026-09-19T09:00:00Z");
    await s.work.action(2, e.id, { action: "salida", revision: 1 });
    await expect(s.start()).rejects.toThrow();
  });
  it("uses server time for employees and rejects zero duration", async () => {
    const s = await setup(),
      e = await s.work.start(2, {
        projectId: 1,
        operationId: crypto.randomUUID(),
        startedAt: "2000-01-01T00:00:00Z",
      });
    expect(e.startedAt).toBe("2026-09-19T08:00:00.000Z");
    await expect(
      s.work.action(2, e.id, { action: "salida", revision: 1 }),
    ).rejects.toThrow("duración");
  });
  it("rejects retroactive changes and supports short measurement labels", async () => {
    const s = await setup();
    await expect(
      s.work.configure(1, 2, {
        engagement: "empleado",
        rateUnit: "hora",
        rateCents: 2000,
        effectiveAt: "2026-09-18T08:00:00Z",
        reason: "Cambio",
      }),
    ).rejects.toThrow("retroactivos");
    expect(
      await s.work.configure(1, 3, {
        engagement: "autonomo",
        rateUnit: "unidad",
        rateCents: 1500,
        unitLabel: "m²",
        reason: "Cambio",
      }),
    ).toMatchObject({ unitLabel: "m²" });
  });
});
