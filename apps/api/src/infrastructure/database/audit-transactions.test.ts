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
  PostgresChangeOrderRepository,
} from "./postgresRepositories.js";
import { EstimateUseCases } from "../../application/use-cases/sales.use-cases.js";
import { UpdateProjectUseCase } from "../../application/use-cases/project.use-cases.js";
import { toProjectDTO } from "../../interfaces/http/projectController.js";
import { InMemoryEventEmitter } from "../events/inMemoryEventEmitter.js";
import { Email, Money, Percentage } from "@reformapro/domain/value-objects";
import { PostgresNoticeStore } from "./clientNoticeStore.js";
import { auditedPool, requestAudit } from "../audit/request-audit.js";
import { PostgresCooldownGate } from "./postgresCooldownGate.js";
import { PostgresBlobCleanupQueue } from "./blobCleanupQueue.js";
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
      "work-tracking.sql",
      "client-notifications.sql",
      "notification-outbox.sql",
      "commercial-workflow.sql",
      "durable-audit.sql",
      "administrative-retirement.sql",
      "project-retention-hardening.sql",
      "archived-work-history-hardening.sql",
      "change-order-optimistic-locking.sql",
      "blob-cleanup-outbox.sql",
      "work-entry-assignment-guard.sql",
      "account-access-outbox.sql",
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
      "ALTER TABLE budget_versions DISABLE TRIGGER budget_version_no_truncate; ALTER TABLE projects DISABLE TRIGGER project_history_no_truncate; ALTER TABLE project_files DISABLE TRIGGER project_files_no_truncate; ALTER TABLE work_budgets DISABLE TRIGGER work_budgets_no_truncate; ALTER TABLE work_entries DISABLE TRIGGER work_entries_no_truncate; ALTER TABLE change_orders DISABLE TRIGGER change_orders_no_truncate; TRUNCATE users CASCADE; ALTER TABLE change_orders ENABLE TRIGGER change_orders_no_truncate; ALTER TABLE work_entries ENABLE TRIGGER work_entries_no_truncate; ALTER TABLE work_budgets ENABLE TRIGGER work_budgets_no_truncate; ALTER TABLE project_files ENABLE TRIGGER project_files_no_truncate; ALTER TABLE projects ENABLE TRIGGER project_history_no_truncate; ALTER TABLE budget_versions ENABLE TRIGGER budget_version_no_truncate; TRUNCATE client_email_notifications; TRUNCATE rate_limit_windows; TRUNCATE blob_cleanup_jobs; DROP TRIGGER IF EXISTS test_failure ON estimates; DROP TRIGGER IF EXISTS activation_failure ON users;",
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
  it("provides the shared rate-limit table in the canonical schema", async () => {
    const gate = new PostgresCooldownGate(pool);
    await expect(gate.check("login:test", 2, 60000)).resolves.toBe(true);
    await expect(gate.check("login:test", 2, 60000)).resolves.toBe(true);
    await expect(gate.check("login:test", 2, 60000)).resolves.toBe(false);
  });
  it("persists orphaned blob cleanup work until it is explicitly completed", async () => {
    const cleanup = new PostgresBlobCleanupQueue(pool);
    await cleanup.stage("projects/orphan.pdf");
    expect(await cleanup.find(10)).toEqual([]);
    await query("UPDATE blob_cleanup_jobs SET next_attempt_at=now() WHERE storage_key=$1", ["projects/orphan.pdf"]);
    expect(await cleanup.find(10)).toEqual([{ storageKey:"projects/orphan.pdf" }]);
    await cleanup.fail("projects/orphan.pdf", "transient");
    expect(await cleanup.find(10)).toEqual([]);
    await cleanup.remove("projects/orphan.pdf");
    expect(await cleanup.find(10)).toEqual([]);
  });
  it("revokes activation links when deactivating an account", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    await tokens.stage({ userId: clientId, tokenHash: "revoked", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await users.update(clientId, { activo: false });
    await expect(tokens.complete("revoked", "new-password")).rejects.toThrow();
    expect((await users.findById(clientId))?.activo).toBe(false);
  });
  it("persists a redacted technical audit inside the business write", async () => {
    await users.update(clientId, { nombre: "Private customer name" });
    const rows = (await query("SELECT payload FROM audit_entries WHERE payload->>'action'='DB_USERS_UPDATE' AND payload->'details'->>'recordId'=$1 ORDER BY timestamp DESC LIMIT 1", [String(clientId)])).rows;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("Private customer name");
    expect(JSON.stringify(rows)).not.toContain("password_hash");
  });
  it("records the authenticated actor without leaking context to the next transaction", async () => {
    const scopedUsers = new PostgresUserRepository(auditedPool(pool),hasher);
    await requestAudit.run({ actorId:adminId,ip:"127.0.0.1",userAgent:"test" }, () => scopedUsers.update(clientId,{ nombre:"Scoped" }));
    const first = (await query("SELECT payload->>'userId' actor FROM audit_entries WHERE payload->>'action'='DB_USERS_UPDATE' AND payload->'details'->>'recordId'=$1 ORDER BY timestamp DESC LIMIT 1",[String(clientId)])).rows[0];
    expect(first).toEqual({actor:String(adminId)});
    await scopedUsers.update(clientId,{ nombre:"Unscoped" });
    const second = (await query("SELECT payload->>'userId' actor FROM audit_entries WHERE payload->>'action'='DB_USERS_UPDATE' AND payload->'details'->>'recordId'=$1 ORDER BY timestamp DESC LIMIT 1",[String(clientId)])).rows[0];
    expect(second).toEqual({actor:"0"});
  });
  it("rolls back a business write when its durable audit cannot be persisted", async () => {
    await db.exec("CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER audit_failure BEFORE INSERT ON audit_entries FOR EACH ROW EXECUTE FUNCTION fail_audit();");
    try {
      await expect(users.update(clientId, { nombre: "Lost" })).rejects.toThrow("audit unavailable");
      expect((await users.findById(clientId))?.nombre).toBe("Client");
    } finally { await db.exec("DROP TRIGGER audit_failure ON audit_entries; DROP FUNCTION fail_audit();"); }
  });
  it("converts a request once and preserves its source", async () => {
    const source = (await query("INSERT INTO solicitudes(nombre,email,telefono,tipo,descripcion,estado,ip,fecha) VALUES('Lead','lead@test.es','','Baño','Reforma','pendiente','127.0.0.1',now()) RETURNING id")).rows[0] as {id:number};
    const input = { clienteId:null,nombre:"Lead",email:"lead@test.es",telefono:"",direccion:"Madrid",tipo:"Baño",descripcion:"Reforma",estado:"nueva" as const,fechaVisita:null,notasInternas:"" };
    const first = await opportunities.fromSolicitud(source.id,input);
    const second = await opportunities.fromSolicitud(source.id,input);
    expect(second.id).toBe(first.id);
    expect((await query("SELECT estado FROM solicitudes WHERE id=$1",[source.id])).rows[0]).toEqual({estado:"contactado"});
  });
  it("rejects stale project writes and applies an approved change only once", async () => {
    const project = await projects.save({ id:0,estimateId,clienteId:clientId,nombre:"Obra",descripcion:"",direccion:"Madrid",tipo:"Reforma",estado:"planificacion",progreso:Percentage.zero(),presupuesto:Money.of(100),fechaInicio:new Date(),fechaFinPrevista:new Date(),profesionalesAsignados:[],hitos:[],createdAt:new Date() });
    await projects.update(project.id,{ nombre:"New" },0);
    await expect(projects.update(project.id,{ descripcion:"Stale" },0)).rejects.toThrow("ha cambiado");
    const changes = new PostgresChangeOrderRepository(pool);
    const order = await changes.save({ projectId:project.id,numero:"OC-test",estado:"borrador",payload:draft,aprobadoAt:null,revision:0 });
    const editedOrder = await changes.update(order.id, { payload: { ...draft, titulo: "Edición vigente" } }, order.revision);
    await expect(changes.update(order.id, { payload: draft }, order.revision)).rejects.toThrow("ha cambiado");
    const sentOrder = await changes.transition(order.id,project.id,"borrador","enviado",adminId,editedOrder.revision);
    await db.exec("CREATE FUNCTION fail_apply_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'budget unavailable'; END $$; CREATE TRIGGER change_apply_failure BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fail_apply_change();");
    try {
      await expect(changes.transition(order.id,project.id,"enviado","aprobado",clientId,sentOrder.revision)).rejects.toThrow("budget unavailable");
      expect((await changes.findByProject(project.id))[0]?.estado).toBe("enviado");
      expect((await projects.findById(project.id))?.presupuesto.amount).toBe(100);
    } finally { await db.exec("DROP TRIGGER change_apply_failure ON projects; DROP FUNCTION fail_apply_change();"); }
    const approvedOrder = await changes.transition(order.id,project.id,"enviado","aprobado",clientId,sentOrder.revision);
    const updated = await projects.findById(project.id);
    expect(updated?.presupuesto.amount).toBe(200);
    expect(updated?.fiscalSnapshots).toHaveLength(1);
    await expect(changes.transition(order.id,project.id,"enviado","aprobado",clientId,approvedOrder.revision)).rejects.toThrow();
    expect((await projects.findById(project.id))?.presupuesto.amount).toBe(200);
    await expect(query("DELETE FROM projects WHERE id=$1",[project.id])).rejects.toThrow("histórico");
    await expect(query("UPDATE change_orders SET payload=$2 WHERE id=$1",[order.id,{...draft,titulo:"Changed"}])).rejects.toThrow("inmutable");
    await expect(query("UPDATE change_orders SET project_id=$2,revision=revision+1 WHERE id=$1", [order.id, project.id + 9999])).rejects.toThrow("identidad");
    await expect(query("DELETE FROM change_orders WHERE id=$1", [order.id])).rejects.toThrow("historico");
    await expect(query("TRUNCATE change_orders")).rejects.toThrow("historico");
  });
  it("blocks physical project deletion even without published change orders", async () => {
    const project = await projects.save({ id:0,estimateId,clienteId:clientId,nombre:"Obra protegida",descripcion:"",direccion:"Madrid",tipo:"Reforma",estado:"planificacion",progreso:Percentage.zero(),presupuesto:Money.of(100),fechaInicio:new Date(),fechaFinPrevista:new Date(),profesionalesAsignados:[],hitos:[],createdAt:new Date() });

    await expect(query("DELETE FROM projects WHERE id=$1", [project.id])).rejects.toThrow("histórico");
    expect(await projects.findById(project.id)).not.toBeNull();
  });
  it("enforces the current professional assignment when a work entry is inserted", async () => {
    const professional = await users.save({ id:0,email:Email.of("worker-guard@test.es"),nombre:"Profesional",rol:"profesional",profesion:"albanil",activo:true,createdAt:new Date() });
    const project = await projects.save({ id:0,estimateId,clienteId:clientId,nombre:"Obra activa",descripcion:"",direccion:"Madrid",tipo:"Reforma",estado:"en_curso",progreso:Percentage.zero(),presupuesto:Money.of(100),fechaInicio:new Date(),fechaFinPrevista:new Date(),profesionalesAsignados:[],hitos:[],createdAt:new Date() });
    const payload = (id: string) => ({ id,professionalId:professional.id,projectId:project.id,status:"abierto",revision:1,startedAt:"2026-10-01T08:00:00.000Z",endedAt:null,pauses:[],breakSeconds:0,units:null,notes:"",rate:{rateUnit:"hora",rateCents:2000},approvedCostCents:null,approvedBy:null,approvedAt:null,reviewReason:"",createdAt:"2026-10-01T08:00:00.000Z" });
    const insert = (id: string) => query("INSERT INTO work_entries(id,professional_id,project_id,started_at,status,seconds,payload) VALUES($1,$2,$3,$4,'abierto',0,$5)", [id,professional.id,project.id,new Date("2026-10-01T08:00:00Z"),payload(id)]);

    await expect(insert(crypto.randomUUID())).rejects.toThrow("no esta asignado");
    const assigned = await projects.update(project.id, { profesionalesAsignados:[{ userId:professional.id,profesion:"albanil" }] }, project.revision ?? 0);
    const entryId = crypto.randomUUID();
    await expect(insert(entryId)).resolves.toBeDefined();
    await projects.update(project.id, { profesionalesAsignados:[] }, assigned.revision ?? 0);
    await expect(query("INSERT INTO work_entries(id,professional_id,project_id,started_at,status,seconds,payload) VALUES($1,$2,$3,$4,'abierto',0,$5) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload", [entryId,professional.id,project.id,new Date("2026-10-01T08:00:00Z"),payload(entryId)])).resolves.toBeDefined();
  });
  it("protects archived project files, labour forecasts and project truncation in the database", async () => {
    const professional = await users.save({ id:0,email:Email.of("worker-history@test.es"),nombre:"Profesional",rol:"profesional",activo:true,createdAt:new Date() });
    const project = await projects.save({ id:0,estimateId,clienteId:clientId,nombre:"Obra archivada",descripcion:"",direccion:"Madrid",tipo:"Reforma",estado:"en_curso",progreso:Percentage.of(20),presupuesto:Money.of(100),fechaInicio:new Date(),fechaFinPrevista:new Date(),profesionalesAsignados:[{ userId:professional.id,profesion:"albanil" }],hitos:[],createdAt:new Date() });
    const entryId = crypto.randomUUID();
    const openPayload = { id:entryId,professionalId:professional.id,projectId:project.id,status:"abierto",revision:1,startedAt:"2026-10-01T08:00:00.000Z",endedAt:null,pauses:[],breakSeconds:0,units:null,notes:"",rate:{rateUnit:"hora",rateCents:2000},approvedCostCents:null,approvedBy:null,approvedAt:null,reviewReason:"",createdAt:"2026-10-01T08:00:00.000Z" };
    await query("INSERT INTO work_entries(id,professional_id,project_id,started_at,status,seconds,payload) VALUES($1,$2,$3,$4,'abierto',0,$5)", [entryId, professional.id, project.id, new Date("2026-10-01T08:00:00Z"), openPayload]);
    const file = (await query("INSERT INTO project_files(project_id,payload) VALUES($1,$2) RETURNING id", [project.id, { deleting: false }])).rows[0] as { id: number };
    const archivedChanges = new PostgresChangeOrderRepository(pool);
    const archivedOrder = await archivedChanges.save({ projectId:project.id,numero:"OC-archived",estado:"borrador",payload:draft,aprobadoAt:null,revision:0 });
    await query("INSERT INTO work_budgets(project_id,payload) VALUES($1,$2)", [project.id, { plannedHours: 10, plannedCostCents: 10000 }]);
    await projects.update(project.id, { archivedAt: new Date(), archiveReason: "Cierre administrativo" }, project.revision ?? 0);

    await expect(query("DELETE FROM project_files WHERE id=$1", [file.id])).rejects.toThrow("archivada");
    await expect(query("UPDATE project_files SET payload=jsonb_set(payload,'{deleting}','true') WHERE id=$1", [file.id])).rejects.toThrow("archivada");
    await expect(query("UPDATE work_budgets SET payload=$2 WHERE project_id=$1", [project.id, { plannedHours: 20, plannedCostCents: 20000 }])).rejects.toThrow("archivada");
    await expect(archivedChanges.update(archivedOrder.id, { payload:{ ...draft,titulo:"Alterada" } }, archivedOrder.revision)).rejects.toThrow("archivada");
    await expect(archivedChanges.transition(archivedOrder.id, project.id, "borrador", "enviado", adminId, archivedOrder.revision)).rejects.toThrow("archivada");
    await expect(query("UPDATE work_entries SET started_at=$2 WHERE id=$1", [entryId, new Date("2026-10-01T07:30:00Z")])).rejects.toThrow("solo se permite");
    const submittedPayload = { ...openPayload, status:"enviado", revision:2, endedAt:"2026-10-01T09:00:00.000Z", notes:"Cierre" };
    const falsifiedPauses = { ...submittedPayload, pauses:[{ startedAt:"2026-10-01T08:30:00.000Z",endedAt:"2026-10-01T09:00:00.000Z" }] };
    await expect(query("UPDATE work_entries SET ended_at=$2,status='enviado',seconds=1800,payload=$3 WHERE id=$1", [entryId, new Date("2026-10-01T09:00:00Z"), falsifiedPauses])).rejects.toThrow("solo se permite");
    await expect(query("UPDATE work_entries SET ended_at=$2,status='enviado',seconds=7200,payload=$3 WHERE id=$1", [entryId, new Date("2026-10-01T09:00:00Z"), submittedPayload])).rejects.toThrow("solo se permite");
    await expect(query("UPDATE work_entries SET ended_at=$2,status='enviado',seconds=3600,payload=$3 WHERE id=$1", [entryId, new Date("2026-10-01T09:00:00Z"), submittedPayload])).resolves.toBeDefined();
    await expect(query("UPDATE work_entries SET started_at=$2 WHERE id=$1", [entryId, new Date("2026-10-01T07:30:00Z")])).rejects.toThrow("solo se permite");
    await expect(query("UPDATE work_entries SET status='aprobado',approved_cost_cents=999,payload=$2 WHERE id=$1", [entryId, { ...submittedPayload,status:"aprobado",revision:3,approvedCostCents:999,approvedBy:adminId,approvedAt:new Date().toISOString(),rate:{rateUnit:"hora",rateCents:9999} }])).rejects.toThrow("solo se permite");
    await expect(query("UPDATE work_entries SET status='aprobado',approved_cost_cents=2000,payload=$2 WHERE id=$1", [entryId, { ...submittedPayload,status:"aprobado",revision:3,approvedCostCents:2000 }])).rejects.toThrow("solo se permite");
    await expect(query("UPDATE work_entries SET status='rechazado',payload=$2 WHERE id=$1", [entryId, { ...submittedPayload,status:"rechazado",revision:3,reviewReason:"" }])).rejects.toThrow("solo se permite");
    const rejectedPayload = { ...submittedPayload,status:"rechazado",revision:3,reviewReason:"No corresponde" };
    await expect(query("UPDATE work_entries SET status='rechazado',payload=$2 WHERE id=$1", [entryId, rejectedPayload])).resolves.toBeDefined();
    await expect(query("UPDATE projects SET payload=jsonb_set(payload,'{nombre}',to_jsonb('Alterada'::text)) WHERE id=$1", [project.id])).rejects.toThrow("archivada");
    await expect(query("TRUNCATE projects CASCADE")).rejects.toThrow("histórico");
    await expect(query("TRUNCATE project_files")).rejects.toThrow("historico");
    await expect(query("TRUNCATE work_budgets")).rejects.toThrow("historico");
  });
  it("does not archive a project while a file deletion is pending", async () => {
    const project = await projects.save({ id:0,estimateId,clienteId:clientId,nombre:"Obra con borrado pendiente",descripcion:"",direccion:"Madrid",tipo:"Reforma",estado:"pausado",progreso:Percentage.of(20),presupuesto:Money.of(100),fechaInicio:new Date(),fechaFinPrevista:new Date(),profesionalesAsignados:[],hitos:[],createdAt:new Date() });
    await query("INSERT INTO project_files(project_id,payload) VALUES($1,$2)", [project.id, { deleting: true }]);

    await expect(projects.update(project.id, { archivedAt: new Date(), archiveReason: "Cierre administrativo" }, project.revision ?? 0)).rejects.toThrow("eliminaciones de archivos pendientes");
    expect((await projects.findById(project.id))?.archivedAt).toBeNull();
  });
  it("returns bounded pages filtered by owner", async () => {
    await users.update(clientId, { activo: true });
    for (let i=0;i<24;i++) await service.create(adminId,(await estimates.findById(estimateId))!.oportunidadId,{...draft,titulo:`Item ${i}`},ctx);
    const first = await service.publicList(adminId);
    const second = await service.publicList(adminId,{page:1});
    expect(first).toHaveLength(20); expect(second).toHaveLength(5);
    expect(first.some(item => second.some(other => other.id===item.id))).toBe(false);
    expect(await service.publicList(clientId)).toEqual([]);
  });
  it("protects the last active administrator in the database", async () => {
    await expect(users.update(adminId, { activo: false })).rejects.toThrow("administrador activo");
    expect((await users.findById(adminId))?.activo).toBe(true);
  });
  it("reuses a checked-out transaction for user updates", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const transactionalUsers = new PostgresUserRepository(client, hasher);
      await transactionalUsers.update(clientId, { nombre: "Transactional" });
      await client.query("ROLLBACK");
    } finally { client.release(); }
    expect((await users.findById(clientId))?.nombre).toBe("Client");
  });
  it("rolls back profile and password when token revocation fails", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    await tokens.stage({ userId: clientId, tokenHash: "pending", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await db.exec("CREATE FUNCTION fail_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'revocation failed'; END $$; CREATE TRIGGER revoke_failure BEFORE DELETE ON account_activation_tokens FOR EACH ROW EXECUTE FUNCTION fail_revoke();");
    try {
      await expect(users.update(clientId, { nombre: "Changed" }, "new-password")).rejects.toThrow("revocation failed");
      expect((await users.findById(clientId))?.nombre).toBe("Client");
    } finally { await db.exec("DROP TRIGGER revoke_failure ON account_activation_tokens; DROP FUNCTION fail_revoke();"); }
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
          canvasSignature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAoAAAAAAAAAAAA",
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
          canvasSignature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAoAAAAAAAAAAAA",
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
    await tokens.stage({
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
  it("stores the access token and its delivery atomically and keeps ambiguous sends retryable", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    await users.update(clientId, { accountStatus: "archived", activo: false });
    const expiresAt = new Date(Date.now() + 60_000);
    const delivery = { id:crypto.randomUUID(),tokenHash:"queued-token",to:"client@example.test",name:"Client",activationUrl:"https://hogaria.test/#/activar-cuenta?token=secret",expiresAt,purpose:"activation" as const };
    await expect(tokens.reserve({ userId:clientId,tokenHash:delivery.tokenHash,expiresAt,usedAt:null }, new Date(), delivery, true)).resolves.toBe(true);
    await expect(users.findById(clientId)).resolves.toMatchObject({ accountStatus:"pending_activation" });
    await expect(tokens.claimDelivery(delivery.tokenHash)).resolves.toMatchObject({ id:delivery.id,activationUrl:delivery.activationUrl });
    await tokens.finishDelivery(delivery.id, "pending");
    expect(await tokens.findValid(delivery.tokenHash, new Date())).not.toBeNull();

    await tokens.discard(delivery.tokenHash);
    await users.update(clientId, { accountStatus: "archived", activo: false });
    await db.exec("CREATE FUNCTION fail_access_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'outbox unavailable'; END $$; CREATE TRIGGER access_outbox_failure BEFORE INSERT ON account_access_outbox FOR EACH ROW EXECUTE FUNCTION fail_access_outbox();");
    try {
      const failed = { ...delivery, id:crypto.randomUUID(),tokenHash:"rolled-back-token" };
      await expect(tokens.reserve({ userId:clientId,tokenHash:failed.tokenHash,expiresAt,usedAt:null }, new Date(Date.now()+120_000), failed, true)).rejects.toThrow("outbox unavailable");
      expect(await tokens.findValid(failed.tokenHash, new Date())).toBeNull();
      await expect(users.findById(clientId)).resolves.toMatchObject({ accountStatus:"archived" });
    } finally {
      await db.exec("DROP TRIGGER access_outbox_failure ON account_access_outbox; DROP FUNCTION fail_access_outbox();");
    }
  });
  it("only one concurrent activation wins and expired links cannot be consumed", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    const previousSessionVersion = (await users.findById(clientId))?.sessionVersion ?? 0;
    await tokens.stage({
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
    expect((await users.findById(clientId))?.sessionVersion).toBe(previousSessionVersion + 1);
    expect(await tokens.findValid("token", new Date())).toBeNull();
    await tokens.stage({
      userId: clientId,
      tokenHash: "expired",
      expiresAt: new Date(0),
      usedAt: null,
    });
    await expect(tokens.complete("expired", "hash")).rejects.toThrow(
      "caducado",
    );
  });
  it("consumes every activation link belonging to the account", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    await tokens.stage({ userId: clientId, tokenHash: "primary", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await tokens.stage({ userId: clientId, tokenHash: "sibling", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await tokens.complete("primary", "new-password");
    expect(await tokens.findValid("sibling", new Date())).toBeNull();
    await expect(tokens.complete("sibling", "other-password")).rejects.toThrow();
  });
  it("does not let a stale concurrent promotion delete the winning link", async () => {
    const tokens = new PostgresActivationTokenRepository(pool);
    await tokens.stage({ userId: clientId, tokenHash: "first-promotion", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await tokens.stage({ userId: clientId, tokenHash: "second-promotion", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await tokens.promote(clientId, "second-promotion");
    await tokens.promote(clientId, "first-promotion");
    expect(await tokens.findValid("first-promotion", new Date())).toBeNull();
    expect(await tokens.findValid("second-promotion", new Date())).not.toBeNull();
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
      changes: { progreso: 50, fechaInicio: "2026-09-01" },
      ctx,
    });
    const restored = toProjectDTO((await projects.findById(project.id))!);
    expect(restored.progreso).toBe(50);
    expect(restored.presupuesto).toBe(100);
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
    await users.update(clientId, { activo: true });
    await estimates.update(estimateId, { borrador: { ...draft, partidas: [{ ...draft.partidas[0]!, descuento: 150 }] } });
    await expect(service.send(adminId, estimateId, ctx)).rejects.toThrow("Propuesta inválida");
    expect(await estimates.findVersions(estimateId)).toHaveLength(0);
    await service.update(adminId, estimateId, { ...draft, partidas: [{ ...draft.partidas[0]!, descuento: 100 }] });
    await service.send(adminId, estimateId, ctx);
    expect((await service.publicGet(clientId, estimateId)).propuesta?.totalConIva).toBe(0);
  });
  it("keeps published proposal snapshots immutable in the database", async () => {
    await users.update(clientId, { activo: true });
    await service.send(adminId, estimateId, ctx);

    await expect(query("UPDATE budget_versions SET snapshot=jsonb_set(snapshot,'{titulo}',to_jsonb('Alterado'::text)) WHERE estimate_id=$1", [estimateId])).rejects.toThrow("inmutable");
    await expect(query("DELETE FROM budget_versions WHERE estimate_id=$1", [estimateId])).rejects.toThrow("histórico");
    await expect(query("UPDATE budget_versions SET id=id+1000000, firmado_at=NOW(), firma='{}'::jsonb WHERE estimate_id=$1", [estimateId])).rejects.toThrow("inmutable");
    await expect(query("TRUNCATE budget_versions")).rejects.toThrow("truncar");
  });
  it("keeps audit entries append-only", async () => {
    const row = (await query("SELECT id FROM audit_entries LIMIT 1")).rows[0] as { id: string };
    expect(row).toBeTruthy();
    await expect(query("UPDATE audit_entries SET payload='{}'::jsonb WHERE id=$1", [row.id])).rejects.toThrow("inmutable");
    await expect(query("DELETE FROM audit_entries WHERE id=$1", [row.id])).rejects.toThrow("inmutable");
    await expect(query("TRUNCATE audit_entries")).rejects.toThrow("inmutable");
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
