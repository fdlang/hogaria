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
});
