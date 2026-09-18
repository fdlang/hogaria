import { describe, expect, it, vi } from "vitest";
import { SalesApi, type EstimateDraftDTO } from "./sales.api";
import type { ApiClient } from "@/shared/lib/api-client";

function createHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiClient;
}

const draft: EstimateDraftDTO = {
  titulo: "Reforma integral",
  validezDias: 30,
  condicionesPago: "50 % a la aceptación y 50 % al finalizar.",
  garantia: "",
  notasCliente: "",
  notasInternas: "",
  partidas: [],
};

describe("SalesApi", () => {
  it("uses the public catalogue endpoint for the estimate wizard", () => {
    const http = createHttp();
    const api = new SalesApi(http);
    api.catalog();
    expect(http.get).toHaveBeenCalledWith("/catalog");
  });

  it("creates an estimate linked to an opportunity", () => {
    const http = createHttp();
    const api = new SalesApi(http);
    api.createEstimate(34, draft);
    expect(http.post).toHaveBeenCalledWith("/estimates", { oportunidadId: 34, borrador: draft });
  });

  it("keeps signing, rejection and conversion as explicit estimate actions", () => {
    const http = createHttp();
    const api = new SalesApi(http);
    api.signEstimate(7, { password: "clave", canvasSignature: "data:image/png;base64,x", consentimiento: "Acepto" });
    api.rejectEstimate(7, "Revisar la distribución del baño");
    api.convertToProject(7);

    expect(http.post).toHaveBeenNthCalledWith(1, "/estimates/7/sign", expect.objectContaining({ password: "clave" }));
    expect(http.post).toHaveBeenNthCalledWith(2, "/estimates/7/reject", { motivo: "Revisar la distribución del baño" });
    expect(http.post).toHaveBeenNthCalledWith(3, "/estimates/7/accept");
  });
});
