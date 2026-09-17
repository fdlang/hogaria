/**
 * Budget HTTP controller.
 *
 * Mappers live HERE, at the transport boundary — never leak domain VOs
 * (Money, IVARate) over the wire. The frontend receives plain numbers/strings.
 */

import {
  CreateBudgetUseCase, SendBudgetUseCase, DeleteBudgetUseCase,
  GetBudgetUseCase, ListBudgetsUseCase, RequestSignatureChallengeUseCase, UpdateBudgetUseCase,
} from "../../application/use-cases/budget.use-cases.js";
import { SignBudgetUseCase } from "../../application/use-cases/sign-budget.use-case.js";
import { Budget } from "@reformapro/domain/entities";
import { toHttpError } from "./errorMiddleware.js";
import { HttpRequest, HttpResponse } from "./authController.js";

export function toBudgetDTO(b: Budget) {
  return {
    id: b.id, proyectoId: b.proyectoId, clienteId: b.clienteId,
    nombre: b.nombre, referencia: b.referencia, estado: b.estado,
    ivaDefault: b.ivaDefault.value,
    validezDias: b.validezDias,
    fechaCreacion: b.fechaCreacion.toISOString(),
    fechaEnvio:    b.fechaEnvio?.toISOString() ?? null,
    fechaExpiracion: b.fechaExpiracion?.toISOString() ?? null,
    condicionesPago: b.condicionesPago, garantia: b.garantia, notas: b.notas,
    partidas: b.partidas.map(p => ({
      id: p.id, categoria: p.categoria, descripcion: p.descripcion,
      cantidad: p.cantidad, unidad: p.unidad,
      precioUnit: p.precioUnit.amount,
      descuento: p.descuento.value,
      iva: p.iva?.value ?? null,
      ref: p.ref ?? null, nota: p.nota ?? null,
    })),
    firma: b.firma ? {
      firmado: b.firma.firmado, firmante: b.firma.firmante,
      firmanteEmail: b.firma.firmanteEmail.value,
      fechaFirma: b.firma.fechaFirma.toISOString(),
      ip: b.firma.ip, hash: b.firma.hash.value, token: b.firma.token,
      consentimiento: b.firma.consentimiento,
    } : null,
  };
}

export function budgetController(deps: {
  create:    CreateBudgetUseCase;
  send:      SendBudgetUseCase;
  delete:    DeleteBudgetUseCase;
  list:      ListBudgetsUseCase;
  get:       GetBudgetUseCase;
  update:    UpdateBudgetUseCase;
  challenge: RequestSignatureChallengeUseCase;
  sign:      SignBudgetUseCase;
}) {
  const ctxOf = (req: HttpRequest) => ({ ip: req.ip, userAgent: req.headers["user-agent"] ?? "unknown" });

  return {
    // POST /budgets
    async create(req: HttpRequest & { actorId: number }): Promise<HttpResponse> {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const budget = await deps.create.execute({
          ...body,
          actorId: req.actorId, ctx: ctxOf(req),
        } as never);
        return { status: 201, body: toBudgetDTO(budget) };
      } catch (e) { return toHttpError(e); }
    },

    // GET /budgets/:id
    async get(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const budget = await deps.get.execute({ actorId: req.actorId, budgetId: parseInt(req.params.id, 10) });
        return { status: 200, body: toBudgetDTO(budget) };
      } catch (e) { return toHttpError(e); }
    },

    // PATCH /budgets/:id
    async update(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const budget = await deps.update.execute({ ...body, actorId: req.actorId, budgetId: parseInt(req.params.id, 10), ctx: ctxOf(req) } as never);
        return { status: 200, body: toBudgetDTO(budget) };
      } catch (e) { return toHttpError(e); }
    },

    // POST /budgets/:id/send
    async send(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const budget = await deps.send.execute({
          actorId: req.actorId,
          budgetId: parseInt(req.params.id, 10),
          ctx: ctxOf(req),
        });
        return { status: 200, body: toBudgetDTO(budget) };
      } catch (e) { return toHttpError(e); }
    },

    // DELETE /budgets/:id
    async delete(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        await deps.delete.execute({ actorId: req.actorId, budgetId: parseInt(req.params.id, 10) });
        return { status: 204, body: null };
      } catch (e) { return toHttpError(e); }
    },

    // GET /budgets?proyectoId=N
    async list(req: HttpRequest & { actorId: number; query: { proyectoId?: string } }): Promise<HttpResponse> {
      try {
        const cmd: { actorId: number; proyectoId?: number } = { actorId: req.actorId };
        if (req.query.proyectoId) cmd.proyectoId = parseInt(req.query.proyectoId, 10);
        const budgets = await deps.list.execute(cmd);
        return { status: 200, body: budgets.map(toBudgetDTO) };
      } catch (e) { return toHttpError(e); }
    },

    // POST /budgets/:id/signature/challenge
    async requestChallenge(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const result = await deps.challenge.execute({
          actorId: req.actorId,
          budgetId: parseInt(req.params.id, 10),
          ctx: ctxOf(req),
        });
        return { status: 200, body: result };
      } catch (e) { return toHttpError(e); }
    },

    // POST /budgets/:id/signature
    async sign(req: HttpRequest & { actorId: number; params: { id: string } }): Promise<HttpResponse> {
      try {
        const body = req.body as { token: string; timestamp: number; canvasSignature: string; password: string; consentimiento: string };
        const result = await deps.sign.execute({
          actorId: req.actorId,
          budgetId: parseInt(req.params.id, 10),
          ...body,
          ctx: ctxOf(req),
        });
        return { status: 200, body: { hash: result.hash, fechaFirma: result.fechaFirma.toISOString() } };
      } catch (e) { return toHttpError(e); }
    },
  };
}
