import { describe, expect, it, vi } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { InMemoryUserRepository, InMemoryProjectRepository, InMemoryOpportunityRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { InMemoryActivationTokenRepository } from "../../infrastructure/database/activationTokenRepositories.js";
import { InMemoryEventEmitter } from "../../infrastructure/events/inMemoryEventEmitter.js";
import { CreateUserUseCase, UpdateUserUseCase, DeleteUserUseCase } from "./user.use-cases.js";
import { AccountActivationUseCases } from "./account-activation.use-cases.js";
import { DeleteFileUseCase, DownloadFileUseCase, ListFilesUseCase, UploadFileUseCase } from "./file.use-cases.js";
import { OpportunityUseCases } from "./sales.use-cases.js";
import { EstimateUseCases } from "./sales.use-cases.js";
import { InMemoryEstimateRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { projectController, toProjectDTO } from "../../interfaces/http/projectController.js";
import { toFileDTO } from "../../interfaces/http/otherControllers.js";

const hasher = { hash: async (s: string) => `hash:${s}`, verify: async () => true };
const ctx = { ip: "test", userAgent: "test" };
async function setup() {
  const users = new InMemoryUserRepository(hasher);
  const admin = await users.save({ id: 0, email: Email.of("admin@test.es"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
  const client = await users.save({ id: 0, email: Email.of("client@test.es"), nombre: "Client", rol: "cliente", activo: false, createdAt: new Date() });
  const events = new InMemoryEventEmitter();
  return { users, admin, client, events, update: new UpdateUserUseCase(users, hasher, events) };
}

describe("Security and integrity regressions", () => {
  it("creates every administrator inactive and sends a one-time activation invitation", async () => {
    const { users, admin, events } = await setup();
    const tokens = new InMemoryActivationTokenRepository(users);
    const sendActivation = vi.fn(async () => undefined);
    const activation = new AccountActivationUseCases(
      users,
      tokens,
      { isConfigured: () => true, sendActivation },
      "https://hogaria.test",
    );
    const create = new CreateUserUseCase(users, hasher, () => "unused-temporary-password", events, activation);

    const result = await create.execute({
      actorId: admin.id,
      email: "new-admin@hogaria.test",
      nombre: "Nueva administradora",
      rol: "admin",
      ctx,
    });

    expect(result.user.activo).toBe(false);
    expect(result.invitationSent).toBe(true);
    expect(sendActivation).toHaveBeenCalledOnce();
  });
  it("rejects professions outside the domain catalogue on create and update", async () => {
    const { users, admin, client, events, update } = await setup();
    const activation = new AccountActivationUseCases(
      users,
      new InMemoryActivationTokenRepository(users),
      { isConfigured: () => true, sendActivation: async () => undefined },
      "https://hogaria.test",
    );
    const create = new CreateUserUseCase(users, hasher, () => "temporary", events, activation);

    await expect(create.execute({
      actorId: admin.id,
      email: "invalid-profession@hogaria.test",
      nombre: "Profesional",
      rol: "profesional",
      profesion: "administrador" as never,
      ctx,
    })).rejects.toThrow(/profesi/i);
    await expect(update.execute({
      actorId: admin.id,
      userId: client.id,
      changes: { profesion: "administrador" as never },
      ctx,
    })).rejects.toThrow(/profesi/i);
  });
  it("never exposes the admin draft endpoint to a client", async () => {
    const { users, client, events } = await setup();
    const service = new EstimateUseCases(users, new InMemoryOpportunityRepository(), new InMemoryEstimateRepository(), new InMemoryProjectRepository(), events, {} as never);
    await expect(service.adminDraft(client.id, 1)).rejects.toThrow();
  });
  it("rejects an invalid password without saving profile changes", async () => {
    const { users, admin, client, update } = await setup();
    await expect(update.execute({ actorId: admin.id, userId: client.id, changes: { nombre: "Changed", newPassword: "short" }, ctx })).rejects.toThrow();
    expect((await users.findById(client.id))?.nombre).toBe("Client");
  });
  it("does not save profile changes when hashing fails", async () => {
    const { users, admin, client, events } = await setup();
    const update = new UpdateUserUseCase(users, { ...hasher, hash: async () => { throw new Error("Unavailable"); } }, events);
    await expect(update.execute({ actorId: admin.id, userId: client.id, changes: { nombre: "Changed", newPassword: "SecurePassword123" }, ctx })).rejects.toThrow("Unavailable");
    expect((await users.findById(client.id))?.nombre).toBe("Client");
  });
  it("prevents self deactivation and removing the last active admin", async () => {
    const { users, admin, update } = await setup();
    await expect(update.execute({ actorId: admin.id, userId: admin.id, changes: { activo: false }, ctx })).rejects.toThrow();
    await expect(users.update(admin.id, { activo: false })).rejects.toThrow("administrador activo");
    expect((await users.findById(admin.id))?.activo).toBe(true);
  });
  it("rejects role injection through the update endpoint", async () => {
    const { admin, client, update } = await setup();
    await expect(update.execute({ actorId: admin.id, userId: client.id, changes: { rol: "admin" } as never, ctx })).rejects.toThrow("no permitido");
  });
  it("revokes outstanding invitations even when the account was already inactive", async () => {
    const { users, admin, client, events } = await setup();
    const tokens = new InMemoryActivationTokenRepository(users);
    await tokens.replace({ userId: client.id, tokenHash: "token", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await new DeleteUserUseCase(users, events).execute({ actorId: admin.id, userId: client.id, ctx });
    await expect(tokens.complete("token", "hash:new")).rejects.toThrow();
    expect((await users.findById(client.id))?.activo).toBe(false);
  });
  it("preserves omitted opportunity fields and rejects reassignment", async () => {
    const { users, admin, client, events } = await setup();
    const repository = new InMemoryOpportunityRepository();
    const service = new OpportunityUseCases(users, repository, events);
    const fechaVisita = new Date("2026-10-01");
    const item = await service.create(admin.id, { clienteId: client.id, nombre: "Obra", direccion: "Madrid", tipo: "Reforma", fechaVisita }, ctx);
    const updated = await service.update(admin.id, item.id, { nombre: "Updated", clienteId: undefined, fechaVisita: undefined } as never);
    expect(updated.clienteId).toBe(client.id);
    expect(updated.fechaVisita).toEqual(fechaVisita);
    await expect(service.update(admin.id, item.id, { clienteId: admin.id })).rejects.toThrow();
  });
  it("checks project access before deleting an owned upload", async () => {
    const { users, client } = await setup();
    const removeBlob = vi.fn(), removeFile = vi.fn();
    const files = { findById: async () => ({ id: 1, projectId: 999, uploadedBy: client.id, sensitive: false, storageKey: "file" }), delete: removeFile };
    const service = new DeleteFileUseCase(users, new InMemoryProjectRepository(), files as never, { delete: removeBlob } as never);
    await expect(service.execute({ actorId: client.id, fileId: 1 })).rejects.toThrow();
    expect(removeBlob).not.toHaveBeenCalled();
    expect(removeFile).not.toHaveBeenCalled();
  });
  it("rejects active-content office documents before writing to storage", async () => {
    const { users, admin, events } = await setup();
    const projects = new InMemoryProjectRepository();
    const project = await projects.save({ id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: 2, direccion: "Madrid", tipo: "Reforma", estado: "en_curso", progreso: { value: 0 }, presupuesto: { amount: 0 }, fechaInicio: new Date(), fechaFinPrevista: new Date(), profesionalesAsignados: [], hitos: [], createdAt: new Date() } as never);
    const storage = { put: vi.fn(), delete: vi.fn() };
    const service = new UploadFileUseCase(users, projects, { save: vi.fn() } as never, storage as never, events);
    await expect(service.execute({ actorId: admin.id, projectId: project.id, nombre: "documento.docx", tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tamaño: 4, sensitive: false, classification: "publico", contenidoBase64: "UEsDBA==", ctx })).rejects.toThrow("no permitido");
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("rejects PDFs containing active-content actions", async () => {
    const { users, admin, events } = await setup();
    const projects = new InMemoryProjectRepository();
    const project = await projects.save({ id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: 2, direccion: "Madrid", tipo: "Reforma", estado: "en_curso", progreso: { value: 0 }, presupuesto: { amount: 0 }, fechaInicio: new Date(), fechaFinPrevista: new Date(), profesionalesAsignados: [], hitos: [], createdAt: new Date() } as never);
    const storage = { put: vi.fn(), delete: vi.fn() };
    const service = new UploadFileUseCase(users, projects, { save: vi.fn() } as never, storage as never, events);
    const payload = btoa("%PDF-1.7\n1 0 obj <</OpenAction 2 0 R /JavaScript (alert)>>");
    await expect(service.execute({ actorId: admin.id, projectId: project.id, nombre: "activo.pdf", tipo: "application/pdf", tamaño: payload.length, sensitive: false, classification: "publico", contenidoBase64: payload, ctx })).rejects.toThrow("no coincide");
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("removes commercial fields from every professional project response", async () => {
    const project = {
      id: 7, revision: 3, estimateId: 91, nombre: "Obra", descripcion: "Ejecución", clienteId: 12,
      direccion: "Madrid", tipo: "Reforma", estado: "en_curso", progreso: { value: 30 },
      presupuesto: { amount: 48500 }, fechaInicio: new Date("2026-01-01"), fechaFinPrevista: new Date("2026-03-01"),
      profesionalesAsignados: [{ userId: 4, profesion: "reformista" }], hitos: [], createdAt: new Date("2026-01-01"),
    } as never;
    const dto = toProjectDTO(project, "professional");
    expect(dto).not.toHaveProperty("presupuesto");
    expect(dto).not.toHaveProperty("estimateId");
    expect(dto).not.toHaveProperty("clienteId");
    expect(dto).toMatchObject({ id: 7, nombre: "Obra", direccion: "Madrid", progreso: 30 });
  });
  it("uses the restricted project DTO at the authenticated HTTP boundary", async () => {
    const { users } = await setup();
    const professional = await users.save({ id: 0, email: Email.of("dto-worker@test.es"), nombre: "Worker", rol: "profesional", profesion: "reformista", activo: true, createdAt: new Date() });
    const project = {
      id: 7, revision: 1, estimateId: 91, nombre: "Obra", descripcion: "", clienteId: 12, direccion: "Madrid", tipo: "Reforma",
      estado: "en_curso", progreso: { value: 30 }, presupuesto: { amount: 48500 }, fechaInicio: new Date(), fechaFinPrevista: new Date(),
      profesionalesAsignados: [{ userId: professional.id, profesion: "reformista" }], hitos: [], createdAt: new Date(),
    } as never;
    const controller = projectController({ users, list: { execute: vi.fn(async () => [project]) } } as never);
    const response = await controller.list({ actorId: professional.id } as never);
    expect(response.status).toBe(200);
    expect((response.body as Array<Record<string, unknown>>)[0]).not.toHaveProperty("presupuesto");
    expect((response.body as Array<Record<string, unknown>>)[0]).not.toHaveProperty("estimateId");
    expect((response.body as Array<Record<string, unknown>>)[0]).not.toHaveProperty("clienteId");
  });
  it("never exposes invoices, contracts or reserved files to an assigned professional", async () => {
    const { users } = await setup();
    const professional = await users.save({ id: 0, email: Email.of("worker@test.es"), nombre: "Worker", rol: "profesional", profesion: "reformista", activo: true, createdAt: new Date() });
    const projects = new InMemoryProjectRepository();
    const project = await projects.save({
      id: 0, estimateId: 1, nombre: "Obra", descripcion: "", clienteId: 2, direccion: "Madrid", tipo: "Reforma",
      estado: "en_curso", progreso: { value: 0 }, presupuesto: { amount: 10000 }, fechaInicio: new Date(),
      fechaFinPrevista: new Date(), profesionalesAsignados: [{ userId: professional.id, profesion: "reformista" }], hitos: [], createdAt: new Date(),
    } as never);
    const base = { projectId: project.id, uploadedBy: 1, nombre: "documento.pdf", tipo: "application/pdf", tamaño: 10, sensitive: false, uploadedAt: new Date() };
    const stored = [
      { ...base, id: 1, storageKey: "public", classification: "publico" },
      { ...base, id: 2, storageKey: "technical", classification: "tecnico" },
      { ...base, id: 3, storageKey: "contract", classification: "contrato", sensitive: true },
      { ...base, id: 4, storageKey: "invoice", classification: "factura", sensitive: true },
      { ...base, id: 5, storageKey: "reserved", classification: "reservado", sensitive: true },
    ];
    const files = {
      findByProject: vi.fn(async () => stored),
      findById: vi.fn(async (id: number) => stored.find(file => file.id === id) ?? null),
    } as never;
    const listed = await new ListFilesUseCase(users, projects, files).execute({ actorId: professional.id, projectId: project.id });
    expect(listed.map(file => file.id)).toEqual([1, 2]);
    const storage = { get: vi.fn(async () => new Uint8Array([1])) } as never;
    const download = new DownloadFileUseCase(users, projects, files, storage);
    await expect(download.execute({ actorId: professional.id, fileId: 2 })).resolves.toBeDefined();
    for (const fileId of [3, 4, 5]) await expect(download.execute({ actorId: professional.id, fileId })).rejects.toThrow();
    expect(storage.get).toHaveBeenCalledTimes(1);
  });
  it("does not expose private storage keys in file metadata", () => {
    const dto = toFileDTO({ id: 1, projectId: 2, uploadedBy: 3, nombre: "plano.pdf", tipo: "application/pdf", tamaño: 10, storageKey: "private/internal/key", sensitive: false, classification: "tecnico", uploadedAt: new Date("2026-01-01") });
    expect(dto).not.toHaveProperty("storageKey");
  });
});
