import { describe, expect, it } from "vitest";
import { Email, Money, Percentage } from "@reformapro/domain/value-objects";
import { ValidationError } from "@reformapro/domain/errors";
import { InMemoryProjectRepository, InMemoryUserRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { AssignProjectProfessionalUseCase, UnassignProjectProfessionalUseCase } from "./project.use-cases.js";

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
});
