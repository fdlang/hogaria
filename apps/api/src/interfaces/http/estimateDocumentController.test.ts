import { describe, expect, it, vi } from "vitest";
import { estimateDocumentController } from "./estimateDocumentController.js";
import type { EstimateDocumentUseCases } from "../../application/use-cases/estimate-document.use-cases.js";

describe("estimateDocumentController", () => {
  it("returns complete PDF response headers and bytes", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const useCases = {
      download: vi.fn().mockResolvedValue({ filename: "presupuesto.pdf", bytes }),
    } as unknown as EstimateDocumentUseCases;
    const response = await estimateDocumentController(useCases).pdf({
      actorId: 2,
      params: { id: "7" },
      query: { version: "1" },
      headers: {},
      body: null,
      ip: "127.0.0.1",
    });

    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject({
      "Content-Type": "application/pdf",
      "Content-Length": "4",
      "Content-Disposition": "inline; filename=\"presupuesto.pdf\"",
      "Cache-Control": "no-store",
    });
    expect(response.body).toBe(bytes);
  });
});
