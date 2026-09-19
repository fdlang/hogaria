import {
  ConflictError,
  ForbiddenError,
  RateLimitError,
  ValidationError,
} from "@reformapro/domain/errors";
import type { IUserRepository } from "@reformapro/domain/repositories";
import type { EstimateUseCases } from "./sales.use-cases.js";
import type { ICooldownGate } from "./solicitud.use-cases.js";

export type EstimateDocument = Awaited<
  ReturnType<EstimateUseCases["publicGet"]>
>;
export interface EstimatePdfRenderer {
  render(document: EstimateDocument): Promise<Uint8Array>;
}

export class EstimateDocumentUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly estimates: EstimateUseCases,
    private readonly pdf: EstimatePdfRenderer,
    private readonly gate: ICooldownGate,
  ) {}
  private async document(actorId: number, id: number, version: number) {
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isSafeInteger(version) ||
      version < 1
    )
      throw new ValidationError("Presupuesto o versión no válidos");
    const actor = await this.users.findById(actorId);
    if (!actor?.activo || !["admin", "cliente"].includes(actor.rol))
      throw new ForbiddenError();
    const document = await this.estimates.publicGet(actorId, id);
    if (!document.propuesta)
      throw new ConflictError(
        "Publica primero una versión del presupuesto para generar su PDF",
      );
    if (document.versionActual !== version)
      throw new ConflictError(
        "La versión ha cambiado. Actualiza el presupuesto",
      );
    return { actor, document };
  }
  async download(actorId: number, id: number, version: number) {
    const { document } = await this.document(actorId, id, version);
    if (!(await this.gate.check(`estimate-pdf:${actorId}`, 60, 60_000)))
      throw new RateLimitError();
    return {
      bytes: await this.pdf.render(document),
      filename: `presupuesto-${document.numero.replace(/[^a-zA-Z0-9_-]/g, "-")}-v${version}.pdf`,
    };
  }
}
