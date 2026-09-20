import { describe, expect, it, vi } from "vitest";
import { SalesApi, type EstimateDraftDTO } from "./sales.api";
import type { ApiClient } from "@/shared/lib/api-client";

function createHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    download: vi.fn(),
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
    api.signEstimate(7, { version: 1, password: "clave", canvasSignature: "data:image/png;base64,x", consentimiento: "Acepto" });
    api.rejectEstimate(7, "Revisar la distribución del baño");
    api.convertToProject(7);

    expect(http.post).toHaveBeenNthCalledWith(1, "/estimates/7/sign", expect.objectContaining({ password: "clave" }));
    expect(http.post).toHaveBeenNthCalledWith(2, "/estimates/7/reject", { motivo: "Revisar la distribución del baño" });
    expect(http.post).toHaveBeenNthCalledWith(3, "/estimates/7/accept");
  });

  it("reuses a PDF while its estimate revision remains unchanged", async () => {
    const http = createHttp();
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    vi.mocked(http.download).mockResolvedValue(blob);
    const api = new SalesApi(http);

    const first = api.downloadPdf(7, 2, "2026-09-20T20:00:00.000Z");
    const simultaneous = api.downloadPdf(7, 2, "2026-09-20T20:00:00.000Z");
    expect(await first).toBe(blob);
    expect(await simultaneous).toBe(blob);
    expect(await api.downloadPdf(7, 2, "2026-09-20T20:00:00.000Z")).toBe(blob);
    expect(http.download).toHaveBeenCalledTimes(1);

    await api.downloadPdf(7, 2, "2026-09-20T20:01:00.000Z");
    expect(http.download).toHaveBeenCalledTimes(2);
  });

  it("revalidates client PDF access after an in-flight request finishes", async () => {
    const http = createHttp();
    vi.mocked(http.download).mockResolvedValue(new Blob(["pdf"]));
    const api = new SalesApi(http);

    const first = api.downloadPdf(7, 2, "revision", { reuse: false });
    const simultaneous = api.downloadPdf(7, 2, "revision", { reuse: false });
    await Promise.all([first, simultaneous]);
    expect(http.download).toHaveBeenCalledTimes(1);

    await api.downloadPdf(7, 2, "revision", { reuse: false });
    expect(http.download).toHaveBeenCalledTimes(2);
  });
});
