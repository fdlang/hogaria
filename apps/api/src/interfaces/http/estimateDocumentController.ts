import type { EstimateDocumentUseCases } from "../../application/use-cases/estimate-document.use-cases.js";
import type { HttpRequest, HttpResponse } from "./authController.js";
type Request = HttpRequest & {
  actorId?: number;
  params: Record<string, string>;
  query: Record<string, string>;
};
export function estimateDocumentController(useCases: EstimateDocumentUseCases) {
  return {
    async pdf(req: Request): Promise<HttpResponse> {
      const result = await useCases.download(
        req.actorId!,
        Number(req.params.id),
        Number(req.query.version),
      );
      return {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "Cache-Control": "no-store",
        },
        body: result.bytes,
      };
    },
  };
}
