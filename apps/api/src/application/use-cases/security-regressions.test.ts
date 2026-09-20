import { describe, expect, it, vi } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { InMemoryUserRepository, InMemoryProjectRepository, InMemoryOpportunityRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { InMemoryActivationTokenRepository } from "../../infrastructure/database/activationTokenRepositories.js";
import { InMemoryEventEmitter } from "../../infrastructure/events/inMemoryEventEmitter.js";
import { UpdateUserUseCase, DeleteUserUseCase } from "./user.use-cases.js";
import { DeleteFileUseCase } from "./file.use-cases.js";
import { OpportunityUseCases } from "./sales.use-cases.js";
import { EstimateUseCases } from "./sales.use-cases.js";
import { InMemoryEstimateRepository } from "../../infrastructure/database/inMemoryRepositories.js";

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
});
