import { describe, expect, it } from "vitest";
import { DEFAULT_ESTIMATE_OBSERVATIONS } from "./estimate-defaults.js";

describe("DEFAULT_ESTIMATE_OBSERVATIONS", () => {
  it("separates estimates, lead times and payment terms in editable default wording", () => {
    expect(DEFAULT_ESTIMATE_OBSERVATIONS).toContain("ESTIMACIONES SUJETAS A CONFIRMACIÓN");
    expect(DEFAULT_ESTIMATE_OBSERVATIONS).toContain("PLAZOS DE FABRICACIÓN Y ACABADOS");
    expect(DEFAULT_ESTIMATE_OBSERVATIONS).toContain("CONDICIONES DE PAGO");
    expect(DEFAULT_ESTIMATE_OBSERVATIONS).toContain("50 % del importe total");
    expect(DEFAULT_ESTIMATE_OBSERVATIONS).toContain("50 % restante");
  });
});
