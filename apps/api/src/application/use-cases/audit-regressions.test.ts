import { describe, it, expect, vi } from "vitest";
import { validateDraft } from "./estimate-validation.js";
import { projectChanges } from "./project-validation.js";
import { projectController } from "../../interfaces/http/projectController.js";
import { fileController } from "../../interfaces/http/otherControllers.js";
import { ForbiddenError } from "@reformapro/domain/errors";
import { ListFilesUseCase, DownloadFileUseCase } from "./file.use-cases.js";
import type { Project, User } from "@reformapro/domain/entities";
import { Email } from "@reformapro/domain/value-objects";
import {
  InMemoryProjectRepository,
  InMemoryUserRepository,
} from "../../infrastructure/database/inMemoryRepositories.js";
const draft = {
  titulo: "Reforma",
  validezDias: 30,
  condicionesPago: "50/50",
  garantia: "",
  notasCliente: "",
  partidas: [
    {
      id: "a",
      categoria: "Obra",
      descripcion: "Trabajo",
      cantidad: 1,
      unidad: "ud",
      precioVentaUnitario: 100,
      descuento: 0,
      iva: 21,
    },
  ],
};
describe("Audit: strict DTOs", () => {
  it.each([
    null,
    [],
    {},
    { ...draft, partidas: [] },
    { ...draft, validezDias: Infinity },
  ])("rejects invalid proposal %j", (value) =>
    expect(() => validateDraft(value)).toThrow(),
  );
  it.each([
    { descuento: 150 },
    { descuento: -1 },
    { cantidad: "2" },
    { cantidad: NaN },
    { precioVentaUnitario: Infinity },
    { iva: 101 },
    { costeUnitario: -1 },
    { id: "" },
    { descripcion: 7 },
  ])("rejects invalid line %j", (line) => {
    expect(() =>
      validateDraft({
        ...draft,
        partidas: [{ ...draft.partidas[0], ...line }],
      }),
    ).toThrow();
  });
  it("rejects duplicate line ids and accepts 100% discount", () => {
    expect(() =>
      validateDraft({
        ...draft,
        partidas: [draft.partidas[0], draft.partidas[0]],
      }),
    ).toThrow();
    expect(() =>
      validateDraft({
        ...draft,
        partidas: [{ ...draft.partidas[0], descuento: 100 }],
      }),
    ).not.toThrow();
  });
  it("converts wire values to domain values", () => {
    const result = projectChanges({
      progreso: 50,
      presupuesto: 1250,
      fechaInicio: "2026-09-01",
      hitos: [
        { id: "h1", nombre: "Obra", completado: false, fecha: "2026-09-02" },
      ],
    });
    expect(result.progreso?.value).toBe(50);
    expect(result.presupuesto?.amount).toBe(1250);
    expect(result.fechaInicio).toBeInstanceOf(Date);
    expect(result.hitos?.[0]?.fecha).toBeInstanceOf(Date);
  });
  it.each([
    { progreso: "50" },
    { progreso: 101 },
    { fechaInicio: "tomorrow" },
    { fechaInicio: "2026-02-31" },
    { estado: "otro" },
    { clienteId: 2 },
    { hitos: [{ id: "a" }] },
  ])("rejects invalid project %j", (value) =>
    expect(() => projectChanges(value)).toThrow(),
  );
});
describe("Audit: authenticated controller boundaries", () => {
  it("never forwards body identity or URL overrides to assignment", async () => {
    const execute = vi.fn(async (command) => {
      expect(command).toEqual({ actorId: 2, projectId: 7, userId: 3 });
      throw new ForbiddenError();
    });
    const controller = projectController({ assign: { execute } } as never);
    const response = await controller.assign({
      actorId: 2,
      params: { id: "7" },
      headers: {},
      ip: "trusted",
      body: {
        actorId: 1,
        projectId: 8,
        userId: 3,
        ctx: { ip: "fake" },
        profesion: "admin",
      },
    } as never);
    expect(response.status).toBe(403);
    expect(execute).toHaveBeenCalledOnce();
  });
  it("never forwards body identity or context to upload", async () => {
    const execute = vi.fn(async (command) => {
      expect(command.actorId).toBe(2);
      expect(command.projectId).toBe(7);
      expect(command.ctx).toEqual({ ip: "trusted", userAgent: "test" });
      throw new ForbiddenError();
    });
    const controller = fileController({ upload: { execute } } as never);
    const response = await controller.upload({
      actorId: 2,
      params: { projectId: "7" },
      headers: { "user-agent": "test" },
      ip: "trusted",
      body: { actorId: 1, projectId: 8, ctx: { ip: "fake" } },
    } as never);
    expect(response.status).toBe(403);
  });
});
describe("Audit: document classification", () => {
  it("separates invoice/contract permissions and denies unclassified sensitive documents", async () => {
    const users = new InMemoryUserRepository({
      hash: async () => "hash",
      verify: async () => true,
    });
    const pro = await users.save({
      id: 1,
      nombre: "Pro",
      email: Email.of("p@example.test"),
      rol: "profesional",
      profesion: "electricista",
      activo: true,
      createdAt: new Date(),
    } as User);
    const projects = new InMemoryProjectRepository();
    const project = await projects.save({
      id: 1,
      clienteId: 2,
      profesionalesAsignados: [{ userId: pro.id, profesion: "electricista" }],
    } as Project);
    const files = [
      {
        id: 1,
        projectId: project.id,
        sensitive: true,
        classification: "contrato",
      },
      {
        id: 2,
        projectId: project.id,
        sensitive: true,
        classification: "factura",
      },
      { id: 3, projectId: project.id, sensitive: true },
    ];
    const repository = {
      findByProject: async () => files,
      findById: async (id: number) => files.find((f) => f.id === id),
    };
    const storage = { get: vi.fn(async () => new Uint8Array()) };
    const list = new ListFilesUseCase(users, projects, repository as never);
    expect(
      (await list.execute({ actorId: pro.id, projectId: project.id })).map(
        (f) => f.id,
      ),
    ).toEqual([1]);
    const download = new DownloadFileUseCase(
      users,
      projects,
      repository as never,
      storage as never,
    );
    for (const fileId of [2, 3])
      await expect(
        download.execute({ actorId: pro.id, fileId }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    expect(storage.get).not.toHaveBeenCalled();
  });
});
