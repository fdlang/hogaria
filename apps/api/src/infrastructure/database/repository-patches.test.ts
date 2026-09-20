import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  PostgresCatalogRepository,
  PostgresOpportunityRepository,
  PostgresSolicitudRepository,
} from "./postgresRepositories";

const poolWith = (query: ReturnType<typeof vi.fn>) => ({ query } as unknown as Pool);

describe("PostgreSQL partial updates", () => {
  it("updates only the supplied opportunity columns without a read-modify-write", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    await expect(new PostgresOpportunityRepository(poolWith(query)).update(7, { nombre: "Nuevo" })).rejects.toThrow();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("SET nombre=$2");
    expect(query.mock.calls[0]?.[0]).not.toContain("direccion=");
  });

  it("updates only the supplied catalogue columns without a read-modify-write", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    await expect(new PostgresCatalogRepository(poolWith(query)).update(4, { salePrice: 25 })).rejects.toThrow();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("sale_price=$2");
    expect(query.mock.calls[0]?.[0]).not.toContain("description=");
  });

  it("changes a request status only while it is pending", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    await expect(new PostgresSolicitudRepository(poolWith(query)).update(3, { estado: "contactado", motivo: null })).rejects.toThrow();
    expect(query.mock.calls[0]?.[0]).toContain("estado='pendiente'");
  });
});
