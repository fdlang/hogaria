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

  it("rejects an empty or non-PDF response instead of opening a blank preview", async () => {
    const http = createHttp();
    const api = new SalesApi(http);
    vi.mocked(http.download).mockResolvedValueOnce(new Blob(["error"], { type: "application/json" }));
    await expect(api.downloadPdf(7, 1, "invalid")).rejects.toThrow("PDF del presupuesto");
    vi.mocked(http.download).mockResolvedValueOnce(new Blob([], { type: "application/pdf" }));
    await expect(api.downloadPdf(7, 1, "empty")).rejects.toThrow("PDF del presupuesto");
  });

  it("revalidates client PDF access after an in-flight request finishes", async () => {
    const http = createHttp();
    vi.mocked(http.download).mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const api = new SalesApi(http);

    const first = api.downloadPdf(7, 2, "revision", { reuse: false });
    const simultaneous = api.downloadPdf(7, 2, "revision", { reuse: false });
    await Promise.all([first, simultaneous]);
    expect(http.download).toHaveBeenCalledTimes(1);

    await api.downloadPdf(7, 2, "revision", { reuse: false });
    expect(http.download).toHaveBeenCalledTimes(2);
  });

  it("clears cached documents when the authenticated user changes", async () => {
    const http = createHttp();
    vi.mocked(http.download).mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const api = new SalesApi(http);

    await api.downloadPdf(7, 1, "revision");
    api.clearPdfCache();
    await api.downloadPdf(7, 1, "revision");

    expect(http.download).toHaveBeenCalledTimes(2);
  });

  it("does not repopulate the PDF cache from an old session request", async () => {
    const http = createHttp();
    let finishDownload!: (blob: Blob) => void;
    vi.mocked(http.download)
      .mockReturnValueOnce(new Promise(resolve => { finishDownload = resolve; }))
      .mockResolvedValue(new Blob(["new-session"], { type: "application/pdf" }));
    const api = new SalesApi(http);

    const oldRequest = api.downloadPdf(7, 1, "revision");
    api.clearPdfCache();
    finishDownload(new Blob(["old-session"], { type: "application/pdf" }));
    await oldRequest;
    await api.downloadPdf(7, 1, "revision");

    expect(http.download).toHaveBeenCalledTimes(2);
  });

  it("uses one look-ahead item to expose reliable pagination", async () => {
    const http = createHttp();
    vi.mocked(http.get).mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({ id: index + 1, numero: `HOG-${index}`, clienteNombre: "Cliente", titulo: "Obra", estado: "enviado", versionActual: 1, motivoRechazo: null, propuesta: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" })));
    const api = new SalesApi(http);

    const result = await api.estimatesPage(2, "cocina", "enviado");
    expect(result.items).toHaveLength(20);
    expect(result.hasNext).toBe(true);
    expect(http.get).toHaveBeenCalledWith("/estimates?page=2&limit=21&search=cocina&status=enviado");
  });

  it("paginates opportunities and sends their expected revision when updating", async () => {
    const http = createHttp();
    vi.mocked(http.get).mockResolvedValue({ items: [], total: 0, page: 2, limit: 20, pages: 1 });
    const api = new SalesApi(http);

    await api.opportunityPage({ page: 2, search: "cocina", status: "nueva" });
    api.updateOpportunity(7, { nombre: "Cocina" }, "2026-10-07T10:00:00.000Z");

    expect(http.get).toHaveBeenCalledWith("/opportunities?page=2&limit=20&search=cocina&status=nueva");
    expect(http.patch).toHaveBeenCalledWith("/opportunities/7", { nombre: "Cocina", expectedUpdatedAt: "2026-10-07T10:00:00.000Z" });
  });

  it("rejects malformed estimate responses instead of trusting a TypeScript cast", async () => {
    const http = createHttp();
    vi.mocked(http.get).mockResolvedValue([{ id: "not-a-number" }]);
    const api = new SalesApi(http);

    await expect(api.estimates()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
