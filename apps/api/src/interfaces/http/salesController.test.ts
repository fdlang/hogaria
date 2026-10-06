import { describe, expect, it, vi } from "vitest";
import { salesController } from "./salesController.js";

const opportunity = {
  id: 7,
  clienteId: null,
  nombre: "Cocina",
  email: null,
  telefono: null,
  direccion: "Madrid",
  tipo: "Integral",
  descripcion: "",
  estado: "nueva" as const,
  fechaVisita: null,
  notasInternas: "",
  createdAt: new Date("2026-10-07T09:00:00.000Z"),
  updatedAt: new Date("2026-10-07T10:00:00.000Z"),
};

const request = { actorId: 1, body: {}, headers: {}, ip: "127.0.0.1" };

describe("salesController opportunities", () => {
  it("returns the paginated contract when page parameters are present", async () => {
    const listPage = vi.fn(async () => ({ items: [opportunity], total: 21, page: 2, limit: 20, pages: 2 }));
    const controller = salesController({ opportunities: { listPage } as never, estimates: {} as never, changes: {} as never });

    const response = await controller.listOpportunities({ ...request, query: { page: "2", limit: "20", search: "cocina", status: "nueva" } });

    expect(response.status).toBe(200);
    expect(listPage).toHaveBeenCalledWith(1, { page: 2, limit: 20, search: "cocina", status: "nueva" });
    expect(response.body).toMatchObject({ total: 21, page: 2, items: [{ id: 7, updatedAt: "2026-10-07T10:00:00.000Z" }] });
  });

  it("requires and forwards the expected opportunity version", async () => {
    const update = vi.fn(async () => opportunity);
    const controller = salesController({ opportunities: { update } as never, estimates: {} as never, changes: {} as never });

    const missing = await controller.updateOpportunity({ ...request, params: { id: "7" }, body: { nombre: "Nueva cocina" } });
    expect(missing.status).toBe(422);
    expect(update).not.toHaveBeenCalled();

    const response = await controller.updateOpportunity({ ...request, params: { id: "7" }, body: { nombre: "Nueva cocina", expectedUpdatedAt: "2026-10-07T10:00:00.000Z" } });
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(1, 7, expect.objectContaining({ nombre: "Nueva cocina" }), new Date("2026-10-07T10:00:00.000Z"));
    expect(update.mock.calls[0]?.[2]).not.toHaveProperty("expectedUpdatedAt");
  });
});
