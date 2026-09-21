import type { CatalogUseCases } from "../../application/use-cases/catalog.use-cases.js";
import { toHttpError } from "./errorMiddleware.js";
import type { HttpRequest, HttpResponse } from "./authController.js";
import { positiveId } from "./requestValidation.js";

export function catalogController(deps: { catalog: CatalogUseCases }) {
  return {
    async list(req: HttpRequest & { actorId: number; query?: { includeInactive?: string } }): Promise<HttpResponse> {
      try {
        const includeInactive = req.query?.includeInactive === "true";
        return { status: 200, body: (await deps.catalog.list(req.actorId, includeInactive)).map(dto) };
      } catch (error) {
        return toHttpError(error);
      }
    },
    async create(req: HttpRequest & { actorId: number }): Promise<HttpResponse> { try { return { status: 201, body: dto(await deps.catalog.create(req.actorId, req.body as never)) }; } catch (error) { return toHttpError(error); } },
    async update(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> { try { return { status: 200, body: dto(await deps.catalog.update(req.actorId, positiveId(req.params.id), req.body as never)) }; } catch (error) { return toHttpError(error); } },
    async archive(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> { try { return { status: 200, body: dto(await deps.catalog.archive(req.actorId, positiveId(req.params.id))) }; } catch (error) { return toHttpError(error); } },
  };
}

function dto(item: { id: number; reference: string; category: string; description: string; unit: string; salePrice: number; vatRate: number; active: boolean; updatedAt: Date }) {
  return { id: item.id, reference: item.reference, category: item.category, description: item.description, unit: item.unit, salePrice: item.salePrice, vatRate: item.vatRate, active: item.active, updatedAt: item.updatedAt.toISOString() };
}
