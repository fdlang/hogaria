import { describe, expect, it, vi } from "vitest";
import { SubmitSolicitudUseCase } from "./solicitud.use-cases";

const ctx = { ip: "127.0.0.1", userAgent: "vitest" };
const valid = {
  nombre: "Cliente",
  email: "cliente@hogaria.test",
  telefono: "+34 614 786 341",
  tipo: "Reforma integral",
  descripcion: "Quiero reformar completamente mi vivienda",
  ctx,
};

describe("SubmitSolicitudUseCase", () => {
  it("rejects a malformed Spanish phone number", async () => {
    const save = vi.fn();
    const service = new SubmitSolicitudUseCase({ save } as never, { check: async () => true });
    await expect(service.execute({ ...valid, telefono: "600 12" })).rejects.toThrow(/teléfono/i);
    expect(save).not.toHaveBeenCalled();
  });

  it("counts description length after trimming whitespace", async () => {
    const save = vi.fn();
    const service = new SubmitSolicitudUseCase({ save } as never, { check: async () => true });
    await expect(service.execute({ ...valid, descripcion: "1234567890123456789 " })).rejects.toThrow("20 caracteres");
    expect(save).not.toHaveBeenCalled();
  });

  it("queues the confirmation only after the request has been saved", async () => {
    const order: string[] = [];
    const save = vi.fn(async () => { order.push("saved"); return { id: 7 }; });
    const notify = vi.fn(async (id: number) => { order.push(`notified:${id}`); });
    const service = new SubmitSolicitudUseCase({ save } as never, { check: async () => true }, notify);
    await expect(service.execute(valid)).resolves.toEqual({ id: 7 });
    expect(order).toEqual(["saved", "notified:7"]);
  });
});
