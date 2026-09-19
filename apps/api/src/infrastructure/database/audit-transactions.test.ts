import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { PostgresActivationTokenRepository } from "./activationTokenRepositories.js";
import { PostgresCommercialTransaction } from "./postgresCommercialTransaction.js";
import {
  PostgresEstimateRepository,
  PostgresOpportunityRepository,
  PostgresProjectRepository,
  PostgresUserRepository,
} from "./postgresRepositories.js";
import { EstimateUseCases } from "../../application/use-cases/sales.use-cases.js";
import { UpdateProjectUseCase } from "../../application/use-cases/project.use-cases.js";
import { toProjectDTO } from "../../interfaces/http/projectController.js";
import { InMemoryEventEmitter } from "../events/inMemoryEventEmitter.js";
import { Email, Money, Percentage } from "@reformapro/domain/value-objects";
import { PostgresNoticeStore } from "./clientNoticeStore.js";
describe("Audit: PostgreSQL transactions and outbox (PGlite)", () => {
  const db = new PGlite();
  // PGlite has one connection. Serialize checked-out clients, like a size-one pool.
  let tail = Promise.resolve();
  let checkedOut = false;
  const query = async (sql: string, args?: unknown[]) => {
    const r = await db.query(sql, args);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  const pool = {
    query: async (sql: string, args?: unknown[]) => {
      if (checkedOut) throw new Error("Transaction escaped its connection");
      return query(sql, args);
    },
    connect: async () => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      checkedOut = true;
      return { query, release: () => { checkedOut = false; release(); } };
    },
  } as unknown as Pool;
  const hasher = { hash: async (s: string) => s, verify: async () => true };
  const users = new PostgresUserRepository(pool, hasher),
    estimates = new PostgresEstimateRepository(pool),
    opportunities = new PostgresOpportunityRepository(pool),
    projects = new PostgresProjectRepository(pool);
  const events = new InMemoryEventEmitter();
  const service = new EstimateUseCases(
    users,
    opportunities,
    estimates,
    projects,
    events,
    {
      hashDocument: async () => ({ value: "hash" }),
      generateSignatureToken: async () => "token",
      verifySignatureToken: async () => true,
    },
    new PostgresCommercialTransaction(pool, hasher),
  );
  const ctx = { ip: "test", userAgent: "test" };
  const draft = {
    titulo: "Obra",
    validezDias: 30,
    condicionesPago: "50/50",
    garantia: "",
    notasCliente: "",
    notasInternas: "",
    partidas: [
      {
        id: "a",
        categoria: "Obra",
        descripcion: "Trabajo",
        cantidad: 1,
        unidad: "ud",
        precioVentaUnitario: 100,
        costeUnitario: 50,
        descuento: 0,
        iva: 21,
      },
    ],
  };
  let adminId: number, clientId: number, estimateId: number;
  beforeAll(async () => {
    for (const file of [
      "schema.sql",
      "client-notifications.sql",
      "notification-outbox.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../../../database/" + file, import.meta.url),
          "utf8",
        ),
      );
  }, 30000);
  afterAll(() => db.close());
  beforeEach(async () => {
    await db.exec(
      "TRUNCATE users CASCADE; TRUNCATE client_email_notifications; DROP TRIGGER IF EXISTS test_failure ON estimates; DROP TRIGGER IF EXISTS activation_failure ON users;",
    );
    adminId = (
      await users.save({
        id: 0,
        email: Email.of("a@example.test"),
        nombre: "Admin",
        rol: "admin",
        activo: true,
        createdAt: new Date(),
      })
    ).id;
    clientId = (
      await users.save({
        id: 0,
        email: Email.of("c@example.test"),
        nombre: "Client",
        rol: "cliente",
        activo: false,
        createdAt: new Date(),
      })
    ).id;
    const opportunity = await opportunities.save({
      clienteId: clientId,
      nombre: "Obra",
      direccion: "Madrid",
      tipo: "Reforma",
      descripcion: "",
      estado: "nueva",
      email: null,
      telefono: null,
      fechaVisita: null,
      notasInternas: "",
    });
    estimateId = (await service.create(adminId, opportunity.id, draft, ctx)).id;
  });
  it("rolls back the published snapshot when the state write fails", async () => {
    await db.exec(
      "CREATE OR REPLACE FUNCTION fail_estimate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER test_failure BEFORE UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION fail_estimate();",
    );
    await expect(service.send(adminId, estimateId, ctx)).rejects.toThrow(
      "injected failure",
    );
    expect(await estimates.findVersions(estimateId)).toHaveLength(0);
    expect((await estimates.findById(estimateId))?.estado).toBe("borrador");
    expect(
      (await query("SELECT * FROM client_email_notifications")).rows,
    ).toHaveLength(0);
  });
  it("serializes duplicate sends and queues exactly one notification", async () => {
    await users.update(clientId, { activo: true });
    const results = await Promise.allSettled([
      service.send(adminId, estimateId, ctx),
      service.send(adminId, estimateId, ctx),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await estimates.findVersions(estimateId)).toHaveLength(1);
    expect(
      (await query("SELECT * FROM client_email_notifications")).rows,
    ).toHaveLength(1);
  });
  it("refuses an old version after revision and republication", async () => {
    await service.send(adminId, estimateId, ctx);
    await service.createRevision(adminId, estimateId);
    await service.send(adminId, estimateId, ctx);
    await expect(
      service.sign(
        clientId,
        estimateId,
        {
          version: 1,
          password: "password",
          canvasSignature: "data:image/png;base64,aGVsbG8=",
          consentimiento: "Acepto",
        },
        ctx,
      ),
    ).rejects.toThrow("versión");
    expect(
      (await estimates.findVersions(estimateId)).every((v) => !v.firmadoAt),
    ).toBe(true);
  });
  it("rolls back a signature if changing the global state fails", async () => {
    await service.send(adminId, estimateId, ctx);
    await db.exec(
      "CREATE OR REPLACE FUNCTION fail_estimate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER test_failure BEFORE UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION fail_estimate();",
    );
    await expect(
      service.sign(
        clientId,
        estimateId,
        {
          version: 1,
          password: "password",
          canvasSignature: "data:image/png;base64,aGVsbG8=",
          consentimiento: "Acepto",
        },
        ctx,
      ),
    ).rejects.toThrow("injected failure");
    expect((await estimates.findVersions(estimateId))[0]?.firmadoAt).toBeNull();
    expect((await estimates.findById(estimateId))?.estado).toBe("enviado");
  });
  it("generates distinct numbers for concurrent proposals", async () => {
    const original = (await estimates.findById(estimateId))!;
    const created = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.create(adminId, original.oportunidadId, draft, ctx),
      ),
    );
    expect(new Set(created.map((row) => row.numero)).size).toBe(10);
  });
  it("creates no notice when its business transaction rolls back", async () => {
    await users.update(clientId, { activo: true });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE estimates SET estado='enviado' WHERE id=$1", [
        estimateId,
      ]);
      expect(
        (await client.query("SELECT * FROM client_email_notifications")).rows,
      ).toHaveLength(1);
      await client.query("ROLLBACK");
      expect(
        (await query("SELECT * FROM client_email_notifications")).rows,
      ).toHaveLength(0);
    } finally {
      client.release();
    }
  });
  it("activation restores its token if updating the account fails", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    await tokens.replace({
      userId: clientId,
      tokenHash: "token",
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
    });
    await db.exec(
      "CREATE OR REPLACE FUNCTION fail_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'activation failure'; END $$; CREATE TRIGGER activation_failure BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_activation();",
    );
    await expect(tokens.complete("token", "hash")).rejects.toThrow(
      "activation failure",
    );
    expect(await tokens.findValid("token", new Date())).not.toBeNull();
    expect((await users.findById(clientId))?.activo).toBe(false);
  });
  it("only one concurrent activation wins and expired links cannot be consumed", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    await tokens.replace({
      userId: clientId,
      tokenHash: "token",
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
    });
    const results = await Promise.allSettled([
      tokens.complete("token", "hash"),
      tokens.complete("token", "other"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await users.findById(clientId))?.activo).toBe(true);
    expect(await tokens.findValid("token", new Date())).toBeNull();
    await tokens.replace({
      userId: clientId,
      tokenHash: "expired",
      expiresAt: new Date(0),
      usedAt: null,
    });
    await expect(tokens.complete("expired", "hash")).rejects.toThrow(
      "caducado",
    );
  });
  it("preserves project domain values across SQL and HTTP serialization", async () => {
    const project = await projects.save({
      id: 0,
      estimateId,
      clienteId: clientId,
      nombre: "Obra",
      descripcion: "",
      direccion: "Madrid",
      tipo: "Reforma",
      estado: "planificacion",
      progreso: Percentage.zero(),
      presupuesto: Money.of(100),
      fechaInicio: new Date("2026-01-01"),
      fechaFinPrevista: new Date("2027-01-01"),
      createdAt: new Date(),
      profesionalesAsignados: [],
      hitos: [],
    });
    const useCase = new UpdateProjectUseCase(users, projects, events);
    await useCase.execute({
      actorId: adminId,
      projectId: project.id,
      changes: { progreso: 50, presupuesto: 200, fechaInicio: "2026-09-01" },
      ctx,
    });
    const restored = toProjectDTO((await projects.findById(project.id))!);
    expect(restored.progreso).toBe(50);
    expect(restored.presupuesto).toBe(200);
    expect(restored.fechaInicio).toBe("2026-09-01T00:00:00.000Z");
  });
  it("queues only customer-visible project changes and team uploads", async () => {
    await users.update(clientId, { activo: true });
    const row = (await query("INSERT INTO projects(cliente_id,estimate_id,payload) VALUES($1,$2,$3) RETURNING id", [clientId, estimateId, { id: 0, progreso: 0, profesionalesAsignados: [] }])).rows[0] as { id: number };
    await query("TRUNCATE client_email_notifications");
    await query("UPDATE projects SET payload=jsonb_set(payload,'{profesionalesAsignados}',$2) || jsonb_build_object('id',id) WHERE id=$1", [row.id, JSON.stringify([{ userId: 99 }])]);
    await query("INSERT INTO project_files(project_id,payload) VALUES($1,$2)", [row.id, { uploadedBy: clientId }]);
    expect((await query("SELECT * FROM client_email_notifications")).rows).toHaveLength(0);
    await query("UPDATE projects SET payload=jsonb_set(payload,'{progreso}','50') WHERE id=$1", [row.id]);
    await query("INSERT INTO project_files(project_id,payload) VALUES($1,$2)", [row.id, { uploadedBy: adminId }]);
    expect((await query("SELECT payload->>'kind' AS kind FROM client_email_notifications ORDER BY payload->>'kind'")).rows).toEqual([{ kind: "document" }, { kind: "project-update" }]);
  });
  it("validates persisted drafts before publication and allows a zero total", async () => {
    await estimates.update(estimateId, { borrador: { ...draft, partidas: [{ ...draft.partidas[0]!, descuento: 150 }] } });
    await expect(service.send(adminId, estimateId, ctx)).rejects.toThrow("Propuesta inválida");
    expect(await estimates.findVersions(estimateId)).toHaveLength(0);
    await service.update(adminId, estimateId, { ...draft, partidas: [{ ...draft.partidas[0]!, descuento: 100 }] });
    await service.send(adminId, estimateId, ctx);
    expect((await service.publicGet(clientId, estimateId)).propuesta?.totalConIva).toBe(0);
  });
  it("will not retry an ambiguous email after its idempotency window", async () => {
    const store = new PostgresNoticeStore(pool),
      id = crypto.randomUUID();
    await store.enqueue({
      id,
      kind: "estimate",
      clientId,
      resourceId: estimateId,
    });
    await store.claim(id);
    await query(
      "UPDATE client_email_notifications SET first_attempt_at=now()-interval '25 hours',next_attempt_at=now() WHERE id=$1",
      [id],
    );
    expect(await store.claim(id)).toBeNull();
    expect(
      (
        await query(
          "SELECT state,failure_reason FROM client_email_notifications WHERE id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({
      state: "failed",
      failure_reason: "idempotency_window_expired",
    });
  });
});
