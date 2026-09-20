import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { ForbiddenError } from "@reformapro/domain/errors";
import { InMemoryCatalogRepository, InMemoryUserRepository } from "../../infrastructure/database/inMemoryRepositories.js";
import { CatalogUseCases } from "./catalog.use-cases.js";
import type { ICatalogRepository } from "@reformapro/domain/repositories";

const hasher = { hash: async () => "hash", verify: async () => true };
const input = { reference: "DEM-900", category: "Demoliciones", description: "Partida de prueba", unit: "ud", salePrice: 125, vatRate: 21 };

async function setup() {
  const users = new InMemoryUserRepository(hasher);
  const admin = await users.save({ id: 0, email: Email.of("admin@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
  const client = await users.save({ id: 0, email: Email.of("client@hogaria.test"), nombre: "Client", rol: "cliente", activo: true, createdAt: new Date() });
  return { admin, client, catalog: new CatalogUseCases(users, new InMemoryCatalogRepository()) };
}

describe("CatalogUseCases — administración exclusiva", () => {
  it("rechaza a usuarios que no son administradores", async () => {
    const { client, catalog } = await setup();
    await expect(catalog.create(client.id, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(catalog.list(client.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("crea y archiva sin eliminar el registro histórico", async () => {
    const { admin, catalog } = await setup();
    const item = await catalog.create(admin.id, input);
    expect((await catalog.list(admin.id)).map(row => row.reference)).toContain("DEM-900");
    await catalog.archive(admin.id, item.id);
    expect(await catalog.list(admin.id)).toHaveLength(0);
    expect((await catalog.list(admin.id, true))[0]?.active).toBe(false);
  });

  it("updates only explicitly supplied fields after normalization", async () => {
    const users = new InMemoryUserRepository(hasher);
    const admin = await users.save({ id: 0, email: Email.of("patch@hogaria.test"), nombre: "Admin", rol: "admin", activo: true, createdAt: new Date() });
    const stored = { id: 7, ...input, active: true, createdAt: new Date(), updatedAt: new Date() };
    let received: Record<string, unknown> | undefined;
    const repository = {
      findById: async () => stored,
      findByReference: async () => null,
      update: async (_id: number, changes: Record<string, unknown>) => { received = changes; return { ...stored, ...changes }; },
    } as unknown as ICatalogRepository;

    await new CatalogUseCases(users, repository).update(admin.id, stored.id, { description: "  Nueva partida  " });
    expect(received).toEqual({ description: "Nueva partida" });
  });
});
