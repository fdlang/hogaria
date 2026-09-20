import type { CatalogItem, User } from "@reformapro/domain/entities";
import type { ICatalogRepository, IUserRepository } from "@reformapro/domain/repositories";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@reformapro/domain/errors";
import { hasAtMostTwoDecimals } from "@reformapro/domain";

type CatalogInput = Pick<CatalogItem, "reference" | "category" | "description" | "unit" | "salePrice" | "vatRate">;
type CatalogPatch = Partial<CatalogInput & Pick<CatalogItem, "active">>;

function assertAdmin(user: User | null): asserts user is User { if (!user || user.rol !== "admin") throw new ForbiddenError(); }

function normalize(input: CatalogInput): CatalogInput {
  const reference = input.reference?.trim().toUpperCase(); const category = input.category?.trim(); const description = input.description?.trim(); const unit = input.unit?.trim();
  if (!reference || !/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(reference)) throw new ValidationError("Referencia inválida", "reference");
  if (!category || category.length > 80) throw new ValidationError("Categoría obligatoria", "category");
  if (!description || description.length > 280) throw new ValidationError("Descripción obligatoria", "description");
  if (!unit || unit.length > 20) throw new ValidationError("Unidad obligatoria", "unit");
  if (!Number.isFinite(input.salePrice) || input.salePrice < 0 || input.salePrice > 999_999_999.99 || !hasAtMostTwoDecimals(input.salePrice)) throw new ValidationError("Precio de venta inválido", "salePrice");
  if (!Number.isInteger(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) throw new ValidationError("IVA inválido", "vatRate");
  return { reference, category, description, unit, salePrice: input.salePrice, vatRate: input.vatRate };
}

export class CatalogUseCases {
  constructor(private readonly users: IUserRepository, private readonly catalog: ICatalogRepository) {}
  async list(actorId: number, includeInactive = false) { assertAdmin(await this.users.findById(actorId)); return this.catalog.findAll(includeInactive); }
  async create(actorId: number, input: CatalogInput) {
    assertAdmin(await this.users.findById(actorId)); const item = normalize(input);
    if (await this.catalog.findByReference(item.reference)) throw new ConflictError("Ya existe una partida con esa referencia");
    return this.catalog.save({ ...item, active: true });
  }
  async update(actorId: number, id: number, input: CatalogPatch) {
    assertAdmin(await this.users.findById(actorId)); const current = await this.catalog.findById(id); if (!current) throw new NotFoundError("Partida de catálogo");
    if (input.active !== undefined && typeof input.active !== "boolean") throw new ValidationError("Estado no válido", "active");
    const candidate = normalize({ reference: input.reference ?? current.reference, category: input.category ?? current.category, description: input.description ?? current.description, unit: input.unit ?? current.unit, salePrice: input.salePrice ?? current.salePrice, vatRate: input.vatRate ?? current.vatRate });
    if (candidate.reference !== current.reference) { const existing = await this.catalog.findByReference(candidate.reference); if (existing && existing.id !== id) throw new ConflictError("Ya existe una partida con esa referencia"); }
    const changes: CatalogPatch = {};
    for (const key of ["reference", "category", "description", "unit", "salePrice", "vatRate"] as const) {
      if (input[key] !== undefined) changes[key] = candidate[key] as never;
    }
    if (input.active !== undefined) changes.active = input.active;
    return this.catalog.update(id, changes);
  }
  async archive(actorId: number, id: number) { assertAdmin(await this.users.findById(actorId)); if (!(await this.catalog.findById(id))) throw new NotFoundError("Partida de catálogo"); return this.catalog.update(id, { active: false }); }
}
