import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { PostgresWorkStore } from "./postgresWorkStore.js";
import type { WorkEntry, WorkRate } from "@reformapro/domain";

describe("PostgreSQL work schema and repository", () => {
  const db = new PGlite();
  const client = {
    query: async (text: string, values?: unknown[]) => {
      const r = await db.query(text, values);
      return { ...r, rowCount: r.affectedRows };
    },
    release: () => {},
  };
  const pool = { ...client, connect: async () => client } as unknown as Pool;
  const store = new PostgresWorkStore(pool);
  const rate: WorkRate = {
    id: crypto.randomUUID(),
    professionalId: 2,
    engagement: "empleado",
    rateUnit: "hora",
    rateCents: 2000,
    unitLabel: "hora",
    effectiveAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const entry: WorkEntry = {
    id: crypto.randomUUID(),
    professionalId: 2,
    professionalName: "Pro",
    profession: "electricista",
    projectId: 1,
    projectName: "Obra",
    kind: "jornada",
    startedAt: "2026-09-19T08:00:00.000Z",
    endedAt: null,
    pauses: [],
    breakSeconds: 0,
    units: null,
    unitLabel: "hora",
    notes: "",
    status: "abierto",
    revision: 1,
    rate,
    approvedCostCents: null,
    approvedBy: null,
    approvedAt: null,
    reviewReason: "",
    createdAt: "2026-09-19T08:00:00.000Z",
  };
  beforeAll(async () => {
    await db.exec(
      "CREATE TABLE users(id BIGINT PRIMARY KEY); CREATE TABLE projects(id BIGINT PRIMARY KEY); INSERT INTO users VALUES(1),(2),(3); INSERT INTO projects VALUES(1);",
    );
    const sql = await readFile(
      new URL("../../../database/work-tracking.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql); // migration must be repeatable
  }, 30000);
  afterAll(async () => {
    await db.close();
  });
  it("persists tariffs, locks transactions and atomically writes audit", async () => {
    await store.transaction(2, async (repo) => {
      await repo.addRate(rate);
      await repo.putEntry(entry);
      await repo.event({
        id: crypto.randomUUID(),
        professionalId: 2,
        entryId: entry.id,
        actorId: 2,
        action: "entrada",
        at: entry.startedAt,
        reason: "",
        before: null,
        after: entry,
      });
    });
    expect(await store.rates(2)).toEqual([rate]);
    expect(await store.openEntry(2)).toEqual(entry);
    expect(await store.events(entry.id)).toHaveLength(1);
    expect(
      await store.overlaps(
        2,
        "2026-09-19T09:00:00Z",
        null,
        crypto.randomUUID(),
      ),
    ).toBe(true);
    expect((await store.list({ professionalId: 3 })).items).toHaveLength(0);
  });
  it("rejects a second open shift and preserves immutable history", async () => {
    await expect(
      store.putEntry({ ...entry, id: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE work_rates SET payload='{}'"),
    ).rejects.toThrow("append-only");
    await expect(db.query("DELETE FROM work_events")).rejects.toThrow(
      "append-only",
    );
    await expect(db.query("DELETE FROM projects WHERE id=1")).rejects.toThrow();
  });
  it("rolls back failed writes and rejects foreign operation IDs", async () => {
    await expect(
      store.transaction(2, async (repo) => {
        await repo.putEntry({ ...entry, notes: "must roll back" });
        throw new Error("failed audit");
      }),
    ).rejects.toThrow();
    expect((await store.entry(entry.id))?.notes).toBe("");
    await expect(
      store.putEntry({ ...entry, professionalId: 3 }),
    ).rejects.toThrow("utilizado");
    expect((await store.entry(entry.id))?.professionalId).toBe(2);
  });
  it("aggregates approved hours and frozen cost, and stores planned budget", async () => {
    await store.putEntry({
      ...entry,
      status: "aprobado",
      endedAt: "2026-09-19T10:00:00Z",
      approvedCostCents: 4000,
      revision: 2,
    });
    expect(await store.summary(1)).toMatchObject({
      approvedHours: 2,
      approvedCostCents: 4000,
      pending: 0,
      open: 0,
    });
    await store.budget(1, {
      projectId: 1,
      plannedHours: 3,
      plannedCostCents: 5000,
    });
    expect((await store.budget(1))?.plannedCostCents).toBe(5000);
    expect(
      (await store.list({ projectId: 1, status: "aprobado", page: 1 })).items,
    ).toHaveLength(0);
    expect(
      (await store.list({ projectId: 1, status: "aprobado", page: 1 })).total,
    ).toBe(1);
  });
});
