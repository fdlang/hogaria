import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { ForbiddenError, NotFoundError } from "@reformapro/domain/errors";
import { InMemoryUserRepository, InMemoryProjectRepository, InMemoryOpportunityRepository, InMemoryEstimateRepository, InMemoryChangeOrderRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { InMemoryEventEmitter } from "../../infrastructure/events/inMemoryEventEmitter.js";
import { ChangeOrderUseCases, EstimateUseCases } from "./sales.use-cases.js";
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
  const opportunityA = await opportunities.save({ clienteId: clientA.id, nombre: "A", email: null, telefono: null, direccion: "Calle A", tipo: "Reforma", descripcion: "", estado: "nueva", fechaVisita: null, notasInternas: "" });
  const opportunityB = await opportunities.save({ clienteId: clientB.id, nombre: "B", email: null, telefono: null, direccion: "Calle B", tipo: "Reforma", descripcion: "", estado: "nueva", fechaVisita: null, notasInternas: "" });
  const estimateA = await estimates.save({ oportunidadId: opportunityA.id, clienteId: clientA.id, numero: "HOG-A", titulo: draft.titulo, estado: "enviado", versionActual: 1, borrador: draft });
  const estimateB = await estimates.save({ oportunidadId: opportunityB.id, clienteId: clientB.id, numero: "HOG-B", titulo: draft.titulo, estado: "enviado", versionActual: 1, borrador: draft });
  for (const estimate of [estimateA, estimateB]) await estimates.saveVersion({ estimateId: estimate.id, version: 1, snapshot: { ...draft, notasInternas: "", partidas: draft.partidas.map(({ costeUnitario: _, notaInterna: __, ...line }) => ({ ...line, costeUnitario: null })) }, enviadoAt: new Date(), firmadoAt: null, firma: null });
  return { users, clientA, clientB, estimateA, estimateB, estimates, estimateUseCases };
}

describe("EstimateUseCases — client privacy and authorization", () => {
  it("only returns the authenticated client's proposals", async () => {
    const { clientA, estimateA, estimateB, estimateUseCases } = await setup();
    const results = await estimateUseCases.publicList(clientA.id);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(estimateA.id);
    expect(results[0]?.id).not.toBe(estimateB.id);
  });

  it("never lists an internal draft in the client portal", async () => {
    const { clientA, estimates, estimateUseCases } = await setup();
    const internalDraft = await estimates.save({ oportunidadId: 1, clienteId: clientA.id, numero: "HOG-DRAFT", titulo: "Borrador interno", estado: "borrador", versionActual: 1, borrador: draft, motivoRechazo: null });

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
    await expect(estimateUseCases.get(clientA.id, estimateB.id)).rejects.toBeInstanceOf(ForbiddenError);
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
    await expect(estimateUseCases.sign(clientA.id, estimateA.id, { password: "hash", canvasSignature: "data:image/png;base64,aGVsbG8=", consentimiento: "Acepto" }, { ip: "127.0.0.1", userAgent: "vitest" })).rejects.toThrow("validez");
    expect((await estimateUseCases.publicGet(clientA.id, estimateA.id)).estado).toBe("caducado");
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
    await expect(useCases.list(clientB.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
