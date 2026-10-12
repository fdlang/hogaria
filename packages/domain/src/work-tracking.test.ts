import { describe, expect, it } from "vitest";
import { canActOnArchivedWork } from "./work-tracking.js";

describe("archived work policy", () => {
  it("only permits closing open shifts and reviewing submitted work", () => {
    expect(canActOnArchivedWork({ role: "profesional", action: "salida", status: "abierto" })).toBe(true);
    expect(canActOnArchivedWork({ role: "profesional", action: "pausa", status: "abierto" })).toBe(false);
    expect(canActOnArchivedWork({ role: "admin", action: "aprobar", status: "enviado" })).toBe(true);
    expect(canActOnArchivedWork({ role: "admin", action: "rechazar", status: "enviado" })).toBe(true);
    expect(canActOnArchivedWork({ role: "admin", action: "corregir", status: "enviado" })).toBe(false);
  });
});
