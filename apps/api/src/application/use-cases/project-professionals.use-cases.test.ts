import { describe, expect, it } from "vitest";
import { Email, Money, Percentage } from "@reformapro/domain/value-objects";
import { ForbiddenError, NotFoundError, ValidationError } from "@reformapro/domain/errors";
import { InMemoryProjectRepository, InMemoryUserRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { InMemoryEventEmitter } from "../../infrastructure/events/inMemoryEventEmitter.js";
import { AssignProjectProfessionalUseCase, GetProjectUseCase, UnassignProjectProfessionalUseCase, UpdateProjectUseCase } from "./project.use-cases.js";

const hasher = { hash: async () => "hash", verify: async () => true };

describe("project professional assignments", () => {
  it("assigns only an active professional and preserves their registered profession", async () => {
    const users = new InMemoryUserRepository(hasher);
    const projects = new InMemoryProjectRepository();
    const admin = await users.save({ id: 0, email: Email.of("admin@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
    const professional = await users.save({ id: 0, email: Email.of("pro@hogaria.test"), nombre: "Pro", rol: "profesional", profesion: "electricista", activo: true, createdAt: new Date() });
    const project = await projects.save({ id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: 1, direccion: "Calle", tipo: "Reforma", estado: "planificacion", progreso: Percentage.zero(), presupuesto: Money.of(0), fechaInicio: new Date(), fechaFinPrevista: new Date(), profesionalesAsignados: [], hitos: [], createdAt: new Date() });
    const assign = new AssignProjectProfessionalUseCase(users, projects);
    const updated = await assign.execute({ actorId: admin.id, projectId: project.id, userId: professional.id, profesion: "pintor" });
    expect(updated.profesionalesAsignados).toEqual([{ userId: professional.id, profesion: "electricista" }]);
    await expect(assign.execute({ actorId: admin.id, projectId: project.id, userId: professional.id })).rejects.toBeInstanceOf(ValidationError);
    const unassign = new UnassignProjectProfessionalUseCase(users, projects);
    expect((await unassign.execute({ actorId: admin.id, projectId: project.id, userId: professional.id })).profesionalesAsignados).toEqual([]);
  });

  it("hides projects belonging to another client", async () => {
    const users = new InMemoryUserRepository(hasher);
    const projects = new InMemoryProjectRepository();
    const owner = await users.save({ id: 0, email: Email.of("owner@hogaria.test"), nombre: "Owner", rol: "cliente", activo: true, createdAt: new Date() });
    const other = await users.save({ id: 0, email: Email.of("other@hogaria.test"), nombre: "Other", rol: "cliente", activo: true, createdAt: new Date() });
    const project = await projects.save({ id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: owner.id, direccion: "Calle", tipo: "Reforma", estado: "planificacion", progreso: Percentage.zero(), presupuesto: Money.of(0), fechaInicio: new Date(), fechaFinPrevista: new Date(), profesionalesAsignados: [], hitos: [], createdAt: new Date() });
    await expect(new GetProjectUseCase(users, projects).execute({ actorId: other.id, projectId: project.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces project transitions and prevents professionals from replacing milestones", async () => {
    const users = new InMemoryUserRepository(hasher);
    const projects = new InMemoryProjectRepository();
    const admin = await users.save({ id: 0, email: Email.of("admin-flow@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
    const professional = await users.save({ id: 0, email: Email.of("worker-flow@hogaria.test"), nombre: "Worker", rol: "profesional", profesion: "reformista", activo: true, createdAt: new Date() });
    const milestoneDate = new Date("2026-10-01T00:00:00.000Z");
    const project = await projects.save({ id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: 20, direccion: "Calle", tipo: "Reforma", estado: "planificacion", progreso: Percentage.zero(), presupuesto: Money.of(0), fechaInicio: new Date("2026-09-01"), fechaFinPrevista: new Date("2026-11-01"), profesionalesAsignados: [{ userId: professional.id, profesion: "reformista" }], hitos: [{ id: "h1", nombre: "Inicio", completado: false, fecha: milestoneDate }], createdAt: new Date() });
    const update = new UpdateProjectUseCase(users, projects, new InMemoryEventEmitter());
    const ctx = { ip: "test", userAgent: "test" };
    await expect(update.execute({ actorId: admin.id, projectId: project.id, changes: { estado: "finalizado", revision: 0 }, ctx })).rejects.toThrow("Transición");
    await expect(update.execute({ actorId: professional.id, projectId: project.id, changes: { hitos: [{ id: "new", nombre: "Sustituido", completado: true, fecha: milestoneDate.toISOString() }], revision: 0 }, ctx })).rejects.toThrow("existentes");
    const updated = await update.execute({ actorId: professional.id, projectId: project.id, changes: { hitos: [{ id: "h1", nombre: "Inicio", completado: true, fecha: milestoneDate.toISOString() }], revision: 0 }, ctx });
    expect(updated.hitos[0]?.completado).toBe(true);
  });

  it("blocks professional changes after completion and direct contractual budget edits", async () => {
    const users = new InMemoryUserRepository(hasher);
    const projects = new InMemoryProjectRepository();
    const admin = await users.save({ id: 0, email: Email.of("admin-closed@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
    const professional = await users.save({ id: 0, email: Email.of("worker-closed@hogaria.test"), nombre: "Worker", rol: "profesional", profesion: "reformista", activo: true, createdAt: new Date() });
    const project = await projects.save({ id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: 20, direccion: "Calle", tipo: "Reforma", estado: "finalizado", progreso: Percentage.of(100), presupuesto: Money.of(100), fechaInicio: new Date("2026-09-01"), fechaFinPrevista: new Date("2026-11-01"), profesionalesAsignados: [{ userId: professional.id, profesion: "reformista" }], hitos: [], createdAt: new Date() });
    const update = new UpdateProjectUseCase(users, projects, new InMemoryEventEmitter());
    const ctx = { ip: "test", userAgent: "test" };

    await expect(update.execute({ actorId: professional.id, projectId: project.id, changes: { progreso: 90, revision: 0 }, ctx })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(update.execute({ actorId: admin.id, projectId: project.id, changes: { progreso: 90, revision: 0 }, ctx })).rejects.toThrow("100 %");
    await expect(update.execute({ actorId: admin.id, projectId: project.id, changes: { presupuesto: 200, revision: 0 }, ctx })).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires dates, a milestone and an assigned professional before starting", async () => {
    const users = new InMemoryUserRepository(hasher);
    const projects = new InMemoryProjectRepository();
    const admin = await users.save({ id: 0, email: Email.of("admin-ready@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
    const project = await projects.save({ id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: 20, direccion: "Calle", tipo: "Reforma", estado: "planificacion", progreso: Percentage.zero(), presupuesto: Money.of(0), fechaInicio: new Date("2026-09-01"), fechaFinPrevista: new Date("2026-09-01"), profesionalesAsignados: [], hitos: [], createdAt: new Date() });
    const update = new UpdateProjectUseCase(users, projects, new InMemoryEventEmitter());

    await expect(update.execute({ actorId: admin.id, projectId: project.id, changes: { estado: "en_curso", revision: 0 }, ctx: { ip: "test", userAgent: "test" } })).rejects.toThrow("planificación");
  });
});
