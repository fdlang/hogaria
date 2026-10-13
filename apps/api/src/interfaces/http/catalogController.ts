import type { CatalogUseCases } from "../../application/use-cases/catalog.use-cases.js";
import { toHttpError } from "./errorMiddleware.js";
import type { HttpRequest, HttpResponse } from "./authController.js";
import { positiveId } from "./requestValidation.js";
import type { CatalogItem } from "@reformapro/domain/entities";
import { calculateCatalogPrice } from "@reformapro/domain";

export function catalogController(deps: { catalog: CatalogUseCases }) {
  return {
    async list(req: HttpRequest & { actorId: number; query?: { includeInactive?: string; picker?: string; search?: string; category?: string; page?: string; limit?: string; references?: string } }): Promise<HttpResponse> {
      try {
        if (req.query?.picker === "true") {
          const page = Number(req.query.page ?? 0);
          const limit = Number(req.query.limit ?? 12);
          const result = await deps.catalog.search(req.actorId, { page, limit, search: req.query.search ?? "", category: req.query.category ?? "", references: req.query.references?.split(",").filter(Boolean) ?? [] });
          return { status: 200, body: { ...result, items: result.items.map(pickerDto) } };
        }
        const includeInactive = req.query?.includeInactive === "true";
        return { status: 200, body: (await deps.catalog.list(req.actorId, includeInactive)).map(dto) };
      } catch (error) {
        return toHttpError(error);
      }
    },
    async create(req: HttpRequest & { actorId: number }): Promise<HttpResponse> { try { return { status: 201, body: dto(await deps.catalog.create(req.actorId, req.body as never)) }; } catch (error) { return toHttpError(error); } },
    async update(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> { try { return { status: 200, body: dto(await deps.catalog.update(req.actorId, positiveId(req.params.id), req.body as never)) }; } catch (error) { return toHttpError(error); } },
    async archive(req: HttpRequest & { actorId: number; params: { id: string }; query: Record<string, string> }): Promise<HttpResponse> { try { return { status: 200, body: dto(await deps.catalog.archive(req.actorId, positiveId(req.params.id), req.query.expectedUpdatedAt)) }; } catch (error) { return toHttpError(error); } },
  };
}

function pickerDto(item: CatalogItem) {
  const pricing = calculateCatalogPrice(item.costBreakdown);
  return { id: item.id, reference: item.reference, category: item.category, description: item.description, unit: item.unit, salePrice: item.salePrice, vatRate: item.vatRate, priceVersion: item.priceVersion, unitCost: pricing.costWithOverhead ?? (pricing.directCost > 0 ? pricing.directCost : null) };
}

function dto(item: CatalogItem) {
  return {
    id: item.id, reference: item.reference, category: item.category, description: item.description,
    unit: item.unit, salePrice: item.salePrice, vatRate: item.vatRate, active: item.active,
    reviewStatus: item.reviewStatus, replacementReference: item.replacementReference, reviewNote: item.reviewNote,
    itemType: item.itemType, costBreakdown: item.costBreakdown, evidence: item.evidence,
    costComposition: item.costComposition, pricingMode: item.pricingMode,
    tariffZone: item.tariffZone, priceVersion: item.priceVersion,
    searchTerms: item.searchTerms, updatedAt: item.updatedAt.toISOString(),
  };
}
