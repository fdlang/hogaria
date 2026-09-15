/**
 * Budgets — hooks built on useResource/useMutation.
 *
 * This file exposes the complete hook surface for budget operations:
 *   - useBudgets(api)         — list
 *   - useBudget(api, id)      — single budget for detail view
 *   - useBudgetMutations(api) — create/update/delete/send
 *   - useBudgetCalculator     — live totals for the form (pure, no I/O)
 *   - useBudgetForm           — form state machine for create/edit
 *
 * The original AdminPresupuestos had ~500 lines inlining all of this.
 */

import { useCallback, useEffect, useMemo, useReducer } from "react";
import { BudgetsApi, BudgetDTO } from "../api/budgets.api";
import { useResource, useMutation } from "@/shared/hooks/useResource";
import { BudgetLine } from "@reformapro/domain/entities";
import { IVARate, Money, Percentage } from "@reformapro/domain/value-objects";
import { calculateBudget, BudgetTotals } from "@reformapro/domain/services";

// ─────────────────────────────────────────────────────────────
// List and single item
// ─────────────────────────────────────────────────────────────
export function useBudgets(api: BudgetsApi, proyectoId?: number) {
  return useResource<BudgetDTO[]>(
    () => api.list(proyectoId),
    [api, proyectoId],
  );
}

export function useBudget(api: BudgetsApi, id: number | null) {
  return useResource<BudgetDTO | null>(
    () => id == null ? Promise.resolve(null) : api.get(id),
    [api, id],
  );
}

// ─────────────────────────────────────────────────────────────
// Mutations — create/update/delete/send
// ─────────────────────────────────────────────────────────────
export function useBudgetMutations(api: BudgetsApi) {
  const create = useMutation((payload: Partial<BudgetDTO>) => api.create(payload));
  const update = useMutation((id: number, changes: Partial<BudgetDTO>) => api.update(id, changes));
  const remove = useMutation((id: number) => api.delete(id));
  const send   = useMutation((id: number) => api.send(id));
  return { create, update, remove, send };
}

// ─────────────────────────────────────────────────────────────
// useBudgetCalculator — live preview of totals while editing
// ─────────────────────────────────────────────────────────────
export type PartidaFormState = BudgetDTO["partidas"][number];

export function useBudgetCalculator(partidas: ReadonlyArray<PartidaFormState>, ivaDefault: number): BudgetTotals {
  return useMemo(() => {
    // Map DTO → domain objects. Invalid rows are tolerated (treated as zero)
    // so live typing doesn't spam validation errors.
    const lines: BudgetLine[] = [];
    for (const p of partidas) {
      try {
        lines.push(new BudgetLine(
          p.id, p.categoria ?? "", p.descripcion ?? "",
          Number.isFinite(p.cantidad) ? p.cantidad : 0, p.unidad ?? "",
          Money.of(Number.isFinite(p.precioUnit) && p.precioUnit >= 0 ? p.precioUnit : 0),
          Percentage.of(p.descuento),
          p.iva != null ? IVARate.of(p.iva) : null,
          p.ref ?? undefined, p.nota ?? undefined,
        ));
      } catch {
        // skip invalid row; UI will show a field error
      }
    }
    return calculateBudget(lines, IVARate.of(ivaDefault));
  }, [partidas, ivaDefault]);
}

// ─────────────────────────────────────────────────────────────
// useBudgetForm — form state machine (create + edit)
// ─────────────────────────────────────────────────────────────
export interface BudgetFormState {
  id: number | null;            // null = creating, number = editing
  proyectoId: number | null;
  clienteId:  number | null;
  nombre: string;
  referencia: string;
  ivaDefault: number;
  validezDias: number;
  condicionesPago: string;
  garantia: string;
  notas: string;
  partidas: PartidaFormState[];
  errors: Record<string, string>;
}

export const INITIAL_FORM_STATE: BudgetFormState = {
  id: null, proyectoId: null, clienteId: null,
  nombre: "", referencia: "",
  ivaDefault: 21, validezDias: 30,
  condicionesPago: "30% inicio, 40% mitad, 30% entrega",
  garantia: "2 años de garantía",
  notas: "",
  partidas: [],
  errors: {},
};

type FormAction =
  | { type: "SET_FIELD"; field: keyof BudgetFormState; value: unknown }
  | { type: "LOAD"; budget: BudgetDTO }
  | { type: "RESET" }
  | { type: "ADD_PARTIDA"; partida: PartidaFormState }
  | { type: "UPDATE_PARTIDA"; id: string; field: keyof PartidaFormState; value: unknown }
  | { type: "REMOVE_PARTIDA"; id: string }
  | { type: "SET_ERRORS"; errors: Record<string, string> };

function reducer(state: BudgetFormState, action: FormAction): BudgetFormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value, errors: stripError(state.errors, action.field as string) };
    case "LOAD":
      return {
        id: action.budget.id,
        proyectoId: action.budget.proyectoId,
        clienteId: action.budget.clienteId,
        nombre: action.budget.nombre,
        referencia: action.budget.referencia,
        ivaDefault: action.budget.ivaDefault,
        validezDias: action.budget.validezDias,
        condicionesPago: action.budget.condicionesPago,
        garantia: action.budget.garantia,
        notas: action.budget.notas,
        // Normalise every line id to string so updatePartida is type-consistent
        partidas: action.budget.partidas.map(p => ({ ...p, id: String(p.id) })),
        errors: {},
      };
    case "RESET":
      return INITIAL_FORM_STATE;
    case "ADD_PARTIDA":
      return { ...state, partidas: [...state.partidas, action.partida] };
    case "UPDATE_PARTIDA":
      return {
        ...state,
        partidas: state.partidas.map(p => p.id === action.id ? { ...p, [action.field]: action.value } : p),
      };
    case "REMOVE_PARTIDA":
      return { ...state, partidas: state.partidas.filter(p => p.id !== action.id) };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    default:
      return state;
  }
}

function stripError(errors: Record<string, string>, field: string): Record<string, string> {
  if (!errors[field]) return errors;
  const { [field]: _, ...rest } = errors;
  return rest;
}

export interface BudgetFormHandle {
  state: BudgetFormState;
  totals: BudgetTotals;
  setField: (field: keyof BudgetFormState, value: unknown) => void;
  load: (budget: BudgetDTO) => void;
  reset: () => void;
  addPartida: (partial?: Partial<PartidaFormState>) => void;
  updatePartida: (id: string, field: keyof PartidaFormState, value: unknown) => void;
  removePartida: (id: string) => void;
  validate: () => boolean;
  toPayload: () => Partial<BudgetDTO>;
}

export function useBudgetForm(): BudgetFormHandle {
  const [state, dispatch] = useReducer(reducer, INITIAL_FORM_STATE);
  const totals = useBudgetCalculator(state.partidas, state.ivaDefault);

  const setField = useCallback((field: keyof BudgetFormState, value: unknown) =>
    dispatch({ type: "SET_FIELD", field, value }), []);

  const load  = useCallback((budget: BudgetDTO)    => dispatch({ type: "LOAD", budget }), []);
  const reset = useCallback(()                     => dispatch({ type: "RESET" }), []);

  const addPartida = useCallback((partial: Partial<PartidaFormState> = {}) => {
    const partida: PartidaFormState = {
      id: crypto.randomUUID(),
      categoria: partial.categoria ?? "",
      descripcion: partial.descripcion ?? "",
      cantidad: partial.cantidad ?? 1,
      unidad: partial.unidad ?? "ud",
      precioUnit: partial.precioUnit ?? 0,
      descuento: partial.descuento ?? 0,
      iva: partial.iva ?? null,
      ref: partial.ref,
      nota: partial.nota,
    };
    dispatch({ type: "ADD_PARTIDA", partida });
  }, []);

  const updatePartida = useCallback((id: string, field: keyof PartidaFormState, value: unknown) =>
    dispatch({ type: "UPDATE_PARTIDA", id, field, value }), []);

  const removePartida = useCallback((id: string) =>
    dispatch({ type: "REMOVE_PARTIDA", id }), []);

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!state.nombre.trim())                   errors.nombre      = "Nombre obligatorio";
    if (!state.proyectoId)                       errors.proyectoId = "Proyecto obligatorio";
    if (!state.clienteId)                        errors.clienteId  = "Cliente obligatorio";
    if (state.validezDias < 1 || state.validezDias > 365) errors.validezDias = "Entre 1 y 365 días";
    if (state.partidas.length === 0)             errors.partidas   = "Al menos una partida";
    state.partidas.forEach((p, i) => {
      if (!p.descripcion.trim()) errors[`partida-${i}-descripcion`] = "Descripción obligatoria";
      if (p.cantidad <= 0)       errors[`partida-${i}-cantidad`]   = "Cantidad > 0";
      if (p.precioUnit < 0)      errors[`partida-${i}-precioUnit`] = "Precio ≥ 0";
    });
    dispatch({ type: "SET_ERRORS", errors });
    return Object.keys(errors).length === 0;
  }, [state]);

  const toPayload = useCallback((): Partial<BudgetDTO> => ({
    proyectoId: state.proyectoId!, clienteId: state.clienteId!,
    nombre: state.nombre.trim(), referencia: state.referencia,
    ivaDefault: state.ivaDefault, validezDias: state.validezDias,
    condicionesPago: state.condicionesPago, garantia: state.garantia, notas: state.notas,
    partidas: state.partidas,
  }), [state]);

  return { state, totals, setField, load, reset, addPartida, updatePartida, removePartida, validate, toPayload };
}
