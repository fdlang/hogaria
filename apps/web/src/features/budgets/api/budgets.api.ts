/**
 * Budgets feature — API class only.
 *
 * Hooks live in ./hooks/useBudgets.ts and are built on the shared
 * useResource / useMutation primitives. Components import both:
 *   import { BudgetsApi, BudgetDTO } from "../api/budgets.api";
 *   import { useBudgets, useBudgetMutations } from "../hooks/useBudgets";
 */

import { ApiClient } from "@/shared/lib/api-client";

export interface BudgetSignatureDTO {
  firmante: string;
  fechaFirma: string;
  ip: string;
  hash: string;
}

export interface BudgetDTO {
  id: number; proyectoId: number; clienteId: number;
  nombre: string; referencia: string;
  estado: "borrador" | "enviado" | "firmado" | "rechazado";
  ivaDefault: number; validezDias: number;
  fechaCreacion: string; fechaEnvio: string | null;
  condicionesPago: string; garantia: string; notas: string;
  partidas: Array<{
    id: string; categoria: string; descripcion: string;
    cantidad: number; unidad: string; precioUnit: number;
    descuento: number; iva: number | null;
    ref?: string; nota?: string;
  }>;
  firma: BudgetSignatureDTO | null;
}

export class BudgetsApi {
  constructor(private readonly http: ApiClient) {}
  list(proyectoId?: number): Promise<BudgetDTO[]>      { return this.http.get(proyectoId ? `/budgets?proyectoId=${proyectoId}` : "/budgets"); }
  get(id: number):           Promise<BudgetDTO>        { return this.http.get(`/budgets/${id}`); }
  create(b: Partial<BudgetDTO>): Promise<BudgetDTO>    { return this.http.post("/budgets", b); }
  update(id: number, changes: Partial<BudgetDTO>): Promise<BudgetDTO> { return this.http.patch(`/budgets/${id}`, changes); }
  delete(id: number):                           Promise<void>         { return this.http.delete(`/budgets/${id}`); }
  send(id: number):                             Promise<BudgetDTO>    { return this.http.post(`/budgets/${id}/send`); }

  requestSignatureChallenge(budgetId: number): Promise<{ challenge: string; timestamp: number; exp: number }> {
    return this.http.post(`/budgets/${budgetId}/signature/challenge`);
  }
  sign(budgetId: number, payload: {
    token: string; timestamp: number; canvasSignature: string;
    password: string; consentimiento: string;
  }): Promise<{ hash: string; fechaFirma: string }> {
    return this.http.post(`/budgets/${budgetId}/signature`, payload);
  }
}
