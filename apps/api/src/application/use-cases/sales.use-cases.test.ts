import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { ForbiddenError, NotFoundError } from "@reformapro/domain/errors";
import { InMemoryUserRepository, InMemoryProjectRepository, InMemoryOpportunityRepository, InMemoryEstimateRepository, InMemoryChangeOrderRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { InMemoryEventEmitter } from "../../infrastructure/events/inMemoryEventEmitter.js";
import { ChangeOrderUseCases, EstimateUseCases, OpportunityUseCases } from "./sales.use-cases.js";
import { PermissionPolicy } from "@reformapro/domain/services";
import { Money, Percentage } from "@reformapro/domain/value-objects";

const hasher = { hash: async () => "hash", verify: async (_plain: string, hash: string) => hash === "hash" };
const cryptoPort = { hashDocument: async () => ({ value: "sha256:test" }), generateSignatureToken: async () => "token", verifySignatureToken: async () => true };
const draft = {
  titulo: "Reforma de vivienda", validezDias: 30, condicionesPago: "50% al inicio", garantia: "", notasCliente: "", notasInternas: "Margen reservado",
  partidas: [{ id: "linea-1", categoria: "Obra", descripcion: "Revestimiento", cantidad: 2, unidad: "m²", precioVentaUnitario: 100, costeUnitario: 45, descuento: 0, iva: 21, notaInterna: "Proveedor preferente" }],
};

async function setup() {
  const users = new InMemoryUserRepository(hasher);
  const clientA = await users.save({ id: 0, email: Email.of("a@hogaria.test"), nombre: "Cliente A", rol: "cliente", activo: true, createdAt: new Date() }, "hash");
  const clientB = await users.save({ id: 0, email: Email.of("b@hogaria.test"), nombre: "Cliente B", rol: "cliente", activo: true, createdAt: new Date() }, "hash");
  const opportunities = new InMemoryOpportunityRepository();
  const estimates = new InMemoryEstimateRepository();
  const estimateUseCases = new EstimateUseCases(users, opportunities, estimates, new InMemoryProjectRepository(), new InMemoryEventEmitter(), cryptoPort);
  const opportunityA = await opportunities.save({ clienteId: clientA.id, nombre: "A", email: null, telefono: null, direccion: "Calle A", tipo: "Reforma", descripcion: "", estado: "en_estudio", fechaVisita: null, notasInternas: "" });
  const opportunityB = await opportunities.save({ clienteId: clientB.id, nombre: "B", email: null, telefono: null, direccion: "Calle B", tipo: "Reforma", descripcion: "", estado: "en_estudio", fechaVisita: null, notasInternas: "" });
  const estimateA = await estimates.save({ oportunidadId: opportunityA.id, clienteId: clientA.id, numero: "HOG-A", titulo: draft.titulo, estado: "enviado", versionActual: 1, borrador: draft });
  const estimateB = await estimates.save({ oportunidadId: opportunityB.id, clienteId: clientB.id, numero: "HOG-B", titulo: draft.titulo, estado: "enviado", versionActual: 1, borrador: draft });
  for (const estimate of [estimateA, estimateB]) await estimates.saveVersion({ estimateId: estimate.id, version: 1, snapshot: { ...draft, notasInternas: "", partidas: draft.partidas.map(({ costeUnitario: _, notaInterna: __, ...line }) => ({ ...line, costeUnitario: null })) }, enviadoAt: new Date(), firmadoAt: null, firma: null });
  return { users, clientA, clientB, opportunityA, opportunityB, estimateA, estimateB, estimates, estimateUseCases, opportunities };
}

describe("EstimateUseCases — client privacy and authorization", () => {
  it("keeps published history readable during a revision without exposing draft data", async () => {
    const {clientA,clientB,estimateA,estimates,estimateUseCases} = await setup();
    await estimates.update(estimateA.id,{estado:"en_revision",versionActual:2,titulo:"Secret draft",borrador:{...draft,titulo:"Secret draft"}});
    const visible = await estimateUseCases.publicGet(clientA.id,estimateA.id);
    expect(visible.versionActual).toBe(1);
    expect(visible.estado).toBe("actualizando");
    expect(JSON.stringify(visible)).not.toContain("Secret draft");
    expect((await estimateUseCases.publicList(clientA.id)).some(item => item.id===estimateA.id)).toBe(true);
    expect((await estimateUseCases.publicList(clientA.id, { status: "enviado" })).some(item => item.id===estimateA.id)).toBe(false);
    expect((await estimateUseCases.publicList(clientA.id, { status: "actualizando" })).some(item => item.id===estimateA.id)).toBe(true);
    const history = await estimateUseCases.history(clientA.id,estimateA.id);
    expect(history).toHaveLength(1);
    expect(JSON.stringify(history)).not.toContain("costeUnitario");
    await expect(estimateUseCases.history(clientB.id,estimateA.id)).rejects.toThrow();
  });
  it("requires the owning client's decision and applies changes only once", async () => {
    const {users,clientA,clientB} = await setup();
    const admin = await users.save({id:0,nombre:"Admin",email:Email.of("admin@test.es"),rol:"admin",activo:true,createdAt:new Date()},"hash");
    const projects = new InMemoryProjectRepository();
    const project = await projects.save({id:0,estimateId:1,clienteId:clientA.id,nombre:"Obra",descripcion:"",direccion:"Madrid",tipo:"Reforma",estado:"planificacion",progreso:Percentage.zero(),presupuesto:Money.of(100),fechaInicio:new Date(),fechaFinPrevista:new Date(),profesionalesAsignados:[],hitos:[],createdAt:new Date()});
    const repository = new InMemoryChangeOrderRepository(projects);
    const service = new ChangeOrderUseCases(users,projects,repository);
    const change = await service.create(admin.id,project.id,draft);
    await service.transition(admin.id,project.id,change.id,"enviado");
    await expect(service.edit(admin.id,project.id,change.id,draft)).rejects.toThrow();
    await expect(service.transition(clientB.id,project.id,change.id,"aprobado","valid")).rejects.toThrow();
    await expect(service.transition(admin.id,project.id,change.id,"aprobado","valid")).rejects.toThrow();
    await expect(service.transition(clientA.id,project.id,change.id,"aprobado")).rejects.toThrow();
    const result = await service.transition(clientA.id,project.id,change.id,"aprobado","valid");
    expect(JSON.stringify(result)).not.toContain("costeUnitario");
    expect((await projects.findById(project.id))?.presupuesto.amount).toBe(300);
    await expect(service.transition(clientA.id,project.id,change.id,"aprobado","valid")).rejects.toThrow();
  });
  it("only returns the authenticated client's proposals", async () => {
    const { clientA, estimateA, estimateB, estimateUseCases } = await setup();
    const results = await estimateUseCases.publicList(clientA.id);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(estimateA.id);
    expect(results[0]?.id).not.toBe(estimateB.id);
  });

  it("hides another client's proposal behind a not-found response", async () => {
    const { clientA, estimateB, estimateUseCases } = await setup();
    await expect(estimateUseCases.get(clientA.id, estimateB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a published signature whose server seal cannot be verified", async () => {
    const { users, clientA, estimateA, estimates, opportunities } = await setup();
    const signedAt = new Date("2026-09-20T10:00:00.000Z");
    await estimates.signVersion(estimateA.id, 1, { token: "tampered", fechaFirma: signedAt.toISOString(), hash: "sha256:test" }, signedAt);
    const invalidCrypto = { ...cryptoPort, verifySignatureToken: async () => false };
    const service = new EstimateUseCases(users, opportunities, estimates, new InMemoryProjectRepository(), new InMemoryEventEmitter(), invalidCrypto);
    await expect(service.publicGet(clientA.id, estimateA.id)).rejects.toThrow("integridad");
  });

  it("recomputes the signed snapshot hash before returning a signed proposal", async () => {
    const { users, clientA, estimateA, estimates, opportunities } = await setup();
    const signedAt = new Date("2026-09-20T10:00:00.000Z");
    await estimates.signVersion(estimateA.id, 1, { token: "valid", fechaFirma: signedAt.toISOString(), hash: "sha256:original" }, signedAt);
    const integrityCrypto = {
      ...cryptoPort,
      hashDocument: async () => ({ value: "sha256:tampered" }),
      verifySignatureToken: async () => true,
    };
    const service = new EstimateUseCases(users, opportunities, estimates, new InMemoryProjectRepository(), new InMemoryEventEmitter(), integrityCrypto);

    await expect(service.publicGet(clientA.id, estimateA.id)).rejects.toThrow("integridad");
  });

  it("verifies signature integrity again before converting a proposal into a project", async () => {
    const { users, estimateA, estimates, opportunities } = await setup();
    const admin = await users.save({ id: 0, email: Email.of("convert@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const signedAt = new Date("2026-09-20T10:00:00.000Z");
    await estimates.signVersion(estimateA.id, 1, { token: "valid", fechaFirma: signedAt.toISOString(), hash: "sha256:original" }, signedAt);
    await estimates.update(estimateA.id, { estado: "firmado" });
    const service = new EstimateUseCases(users, opportunities, estimates, new InMemoryProjectRepository(), new InMemoryEventEmitter(), { ...cryptoPort, hashDocument: async () => ({ value: "sha256:tampered" }) });

    await expect(service.accept(admin.id, estimateA.id, { ip: "test", userAgent: "test" })).rejects.toThrow("integridad");
  });

  it.each(["descartada", "ganada"] as const)("does not convert a signed proposal after its opportunity is %s", async (estado) => {
    const { users, estimateA, opportunityA, estimates, opportunities } = await setup();
    const admin = await users.save({ id: 0, email: Email.of("discarded-conversion@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const signedAt = new Date("2026-09-20T10:00:00.000Z");
    await estimates.signVersion(estimateA.id, 1, { token: "valid", fechaFirma: signedAt.toISOString(), hash: "sha256:test" }, signedAt);
    await estimates.update(estimateA.id, { estado: "firmado" });
    await opportunities.update(opportunityA.id, { estado });
    const service = new EstimateUseCases(users, opportunities, estimates, new InMemoryProjectRepository(), new InMemoryEventEmitter(), cryptoPort);

    await expect(service.accept(admin.id, estimateA.id, { ip: "test", userAgent: "test" })).rejects.toThrow("abierta");
  });

  it("converts a legacy signed proposal whose active opportunity predates automatic study state", async () => {
    const { users, estimateA, opportunityA, estimates, opportunities } = await setup();
    const admin = await users.save({ id: 0, email: Email.of("legacy-conversion@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const signedAt = new Date("2026-09-20T10:00:00.000Z");
    await estimates.signVersion(estimateA.id, 1, { token: "valid", fechaFirma: signedAt.toISOString(), hash: "sha256:test" }, signedAt);
    await estimates.update(estimateA.id, { estado: "firmado" });
    await opportunities.update(opportunityA.id, { estado: "contactada" });
    const service = new EstimateUseCases(users, opportunities, estimates, new InMemoryProjectRepository(), new InMemoryEventEmitter(), cryptoPort);

    const project = await service.accept(admin.id, estimateA.id, { ip: "test", userAgent: "test" });

    expect(project.estimateId).toBe(estimateA.id);
    expect((await opportunities.findById(opportunityA.id))?.estado).toBe("ganada");
  });

  it.each(["borrador", "en_revision"] as const)("never lists an internal draft (%s) in the client portal", async (estado) => {
    const { clientA, estimates, estimateUseCases } = await setup();
    const internalDraft = await estimates.save({ oportunidadId: 1, clienteId: clientA.id, numero: "HOG-DRAFT", titulo: "Borrador interno", estado, versionActual: 1, borrador: draft, motivoRechazo: null });

    const results = await estimateUseCases.publicList(clientA.id);

    expect(results.map(item => item.numero)).not.toContain("HOG-DRAFT");
    expect(results.map(item => item.titulo)).not.toContain("Borrador interno");
    await expect(estimateUseCases.publicGet(clientA.id, internalDraft.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never exposes internal draft costs or notes in the public proposal", async () => {
    const { clientA, estimateUseCases } = await setup();
    const [proposal] = await estimateUseCases.publicList(clientA.id);
    expect(proposal).not.toHaveProperty("borrador");
    expect(proposal?.propuesta).not.toHaveProperty("notasInternas");
    expect(proposal?.propuesta?.partidas[0]).not.toHaveProperty("costeUnitario");
    expect(proposal?.propuesta?.partidas[0]).not.toHaveProperty("notaInterna");
  });

  it("prevents one client from reading or signing another client's proposal", async () => {
    const { clientA, estimateB, estimateUseCases } = await setup();
    await expect(estimateUseCases.get(clientA.id, estimateB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(estimateUseCases.sign(clientA.id, estimateB.id, { password: "any", canvasSignature: "data:image/png;base64,x", consentimiento: "Acepto" }, { ip: "127.0.0.1", userAgent: "vitest" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("persists a change request while returning only the public proposal shape", async () => {
    const { clientA, estimateA, estimateUseCases } = await setup();
    await estimateUseCases.reject(clientA.id, estimateA.id, "Necesito revisar la distribución del baño", { ip: "127.0.0.1", userAgent: "vitest" });
    const proposal = await estimateUseCases.publicGet(clientA.id, estimateA.id);
    expect(proposal.estado).toBe("rechazado");
    expect(proposal.motivoRechazo).toContain("distribución");
    expect(JSON.stringify(proposal)).not.toContain("Margen reservado");
    expect(JSON.stringify(proposal)).not.toContain("Proveedor preferente");
  });

  it("does not permit a client to sign an expired proposal", async () => {
    const { clientA, estimateA, estimates, estimateUseCases } = await setup();
    // The repository setup has a current version; replace it with a one-day validity proposal sent two days ago.
    await estimates.saveVersion({ estimateId: estimateA.id, version: 2, snapshot: { ...draft, validezDias: 1 }, enviadoAt: new Date(Date.now() - 2 * 86_400_000), firmadoAt: null, firma: null });
    await estimates.update(estimateA.id, { versionActual: 2 });
    await expect(estimateUseCases.sign(clientA.id, estimateA.id, { version: 2, password: "hash", canvasSignature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAoAAAAAAAAAAAA", consentimiento: "Acepto" }, { ip: "127.0.0.1", userAgent: "vitest" })).rejects.toThrow("validez");
    expect((await estimateUseCases.publicGet(clientA.id, estimateA.id)).estado).toBe("caducado");
  });

  it.each(["descartada", "ganada"] as const)("does not permit signing after the opportunity is %s", async (estado) => {
    const { clientA, estimateA, opportunityA, opportunities, estimateUseCases } = await setup();
    await opportunities.update(opportunityA.id, { estado });

    await expect(estimateUseCases.sign(clientA.id, estimateA.id, {
      version: 1,
      password: "hash",
      canvasSignature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAoAAAAAAAAAAAA",
      consentimiento: "Acepto",
    }, { ip: "127.0.0.1", userAgent: "vitest" })).rejects.toThrow("abierta");
  });

  it("allows a client to read only their own project", async () => {
    const { clientA, clientB } = await setup();
    const project = { id: 1, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: clientA.id, direccion: "Calle A", tipo: "Reforma", estado: "planificacion" as const, progreso: { value: 0 }, presupuesto: { amount: 0 }, fechaInicio: new Date(), fechaFinPrevista: new Date(), profesionalesAsignados: [], hitos: [], createdAt: new Date() };
    expect(PermissionPolicy.can(clientA, "project.read", { project: project as never })).toBe(true);
    expect(PermissionPolicy.can(clientB, "project.read", { project: project as never })).toBe(false);
  });

  it("only exposes sent change orders without internal pricing to the project client", async () => {
    const { users, clientA, clientB } = await setup();
    const projects = new InMemoryProjectRepository();
    const changes = new InMemoryChangeOrderRepository();
    const project = await projects.save({
      id: 0, estimateId: 100, nombre: "Obra A", descripcion: "", clienteId: clientA.id,
      direccion: "Calle A", tipo: "Reforma", estado: "planificacion", progreso: Percentage.zero(),
      presupuesto: Money.of(0), fechaInicio: new Date(), fechaFinPrevista: new Date(),
      profesionalesAsignados: [], hitos: [], createdAt: new Date(),
    });
    await changes.save({ projectId: project.id, numero: "OC-001", estado: "borrador", payload: draft, aprobadoAt: null });
    await changes.save({ projectId: project.id, numero: "OC-002", estado: "enviado", payload: draft, aprobadoAt: null });
    const useCases = new ChangeOrderUseCases(users, projects, changes);

    const ownOrders = await useCases.list(clientA.id, project.id);
    expect(ownOrders).toHaveLength(1);
    expect(ownOrders[0]).toMatchObject({ numero: "OC-002", estado: "enviado" });
    expect(JSON.stringify(ownOrders)).not.toContain("Margen reservado");
    expect(JSON.stringify(ownOrders)).not.toContain("Proveedor preferente");
    expect(JSON.stringify(ownOrders)).not.toContain("costeUnitario");
    await expect(useCases.list(clientB.id, project.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("OpportunityUseCases — governed pipeline", () => {
  it.each(["ganada", "descartada"] as const)("does not create an opportunity directly as %s", async (estado) => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of(`create-${estado}@hogaria.test`), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const service = new OpportunityUseCases(users, new InMemoryOpportunityRepository(), new InMemoryEventEmitter());
    await expect(service.create(admin.id, { clienteId: null, nombre: "Obra", direccion: "Madrid", tipo: "Integral", estado }, { ip: "test", userAgent: "test" })).rejects.toThrow();
  });

  it("rejects an invalid visit date when creating an opportunity", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("invalid-date@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const service = new OpportunityUseCases(users, new InMemoryOpportunityRepository(), new InMemoryEventEmitter());
    await expect(service.create(admin.id, { clienteId: null, nombre: "Obra", direccion: "Madrid", tipo: "Integral", fechaVisita: new Date("invalid") }, { ip: "test", userAgent: "test" })).rejects.toThrow("Fecha");
  });
  it("applies the same contact validation when updating an opportunity", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("contact-update@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const opportunities = new InMemoryOpportunityRepository();
    const service = new OpportunityUseCases(users, opportunities, new InMemoryEventEmitter());
    const opportunity = await service.create(admin.id, { clienteId: null, nombre: "Obra", direccion: "Madrid", tipo: "Integral" }, { ip: "test", userAgent: "test" });

    await expect(service.update(admin.id, opportunity.id, { email: "invalid" })).rejects.toThrow();
    await expect(service.update(admin.id, opportunity.id, { telefono: "123" })).rejects.toThrow("Teléfono");
    await service.update(admin.id, opportunity.id, { email: "  cliente@hogaria.test ", telefono: " +34 614 786 341 " });
    expect(await opportunities.findById(opportunity.id)).toMatchObject({ email: "cliente@hogaria.test", telefono: "+34 614 786 341" });
  });
  it("accepts only forward commercial transitions and keeps terminal states closed", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("pipeline@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const opportunities = new InMemoryOpportunityRepository();
    const service = new OpportunityUseCases(users, opportunities, new InMemoryEventEmitter());
    const opportunity = await service.create(admin.id, { clienteId: null, nombre: "Reforma", email: null, telefono: null, direccion: "Madrid", tipo: "Integral", descripcion: "", estado: "nueva", fechaVisita: null, notasInternas: "" }, { ip: "test", userAgent: "test" });

    await expect(service.update(admin.id, opportunity.id, { estado: "ganada" })).rejects.toThrow("Transición");
    await service.update(admin.id, opportunity.id, { estado: "contactada" });
    await service.update(admin.id, opportunity.id, { estado: "en_estudio" });
    await service.update(admin.id, opportunity.id, { estado: "ganada" });
    await expect(service.update(admin.id, opportunity.id, { estado: "contactada" })).rejects.toThrow("Transición");
  });

  it("does not create proposals for a terminal opportunity", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("terminal-admin@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const client = await users.save({ id: 0, email: Email.of("terminal-client@hogaria.test"), nombre: "Cliente", rol: "cliente", activo: true, createdAt: new Date() }, "hash");
    const opportunities = new InMemoryOpportunityRepository();
    const opportunity = await opportunities.save({ clienteId: client.id, nombre: "Cerrada", email: null, telefono: null, direccion: "Madrid", tipo: "Integral", descripcion: "", estado: "descartada", fechaVisita: null, notasInternas: "" });
    const service = new EstimateUseCases(users, opportunities, new InMemoryEstimateRepository(), new InMemoryProjectRepository(), new InMemoryEventEmitter(), cryptoPort);
    await expect(service.create(admin.id, opportunity.id, draft, { ip: "test", userAgent: "test" })).rejects.toThrow("cerrada");
  });

  it("moves a new opportunity into study atomically when its proposal is created", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("study-admin@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() }, "hash");
    const client = await users.save({ id: 0, email: Email.of("study-client@hogaria.test"), nombre: "Cliente", rol: "cliente", activo: true, createdAt: new Date() }, "hash");
    const opportunities = new InMemoryOpportunityRepository();
    const opportunity = await opportunities.save({ clienteId: client.id, nombre: "Nueva", email: null, telefono: null, direccion: "Madrid", tipo: "Integral", descripcion: "", estado: "nueva", fechaVisita: null, notasInternas: "" });
    const service = new EstimateUseCases(users, opportunities, new InMemoryEstimateRepository(), new InMemoryProjectRepository(), new InMemoryEventEmitter(), cryptoPort);

    await service.create(admin.id, opportunity.id, draft, { ip: "test", userAgent: "test" });

    expect((await opportunities.findById(opportunity.id))?.estado).toBe("en_estudio");
  });
});
