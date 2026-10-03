import { describe, expect, it } from "vitest";
import { publicSolicitudError } from "./components/PublicLanding";

describe("publicSolicitudError", () => {
  it("gives actionable messages for throttling, validation and timeouts", () => {
    expect(publicSolicitudError({ status: 429 })).toContain("Espera unos minutos");
    expect(publicSolicitudError({ status: 422, message: "El teléfono no es válido" })).toBe("El teléfono no es válido");
    expect(publicSolicitudError({ code: "TIMEOUT" })).toContain("tardando demasiado");
  });

  it("does not expose unknown server details", () => {
    expect(publicSolicitudError({ status: 500, message: "SQL connection failed" })).not.toContain("SQL");
  });
});
