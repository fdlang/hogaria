/**
 * useSignatureFlow — explicit state machine for the 4-step signing wizard.
 *
 * States (each is exhaustive; transitions are the only way to move between them):
 *
 *   idle ──request──▶ requesting ──success──▶ drawing ──sign──▶ confirming ──submit──▶ signing ──success──▶ done
 *     ▲                   │                      │                    │                       │
 *     └──error/cancel─────┴──────────────────────┴────────────────────┴───────────────────────┘
 */

import { useCallback, useReducer } from "react";
import { BudgetsApi } from "@/features/budgets/api/budgets.api";

type State =
  | { kind: "idle" }
  | { kind: "requesting"; budgetId: number }
  | { kind: "drawing"; budgetId: number; challenge: string; timestamp: number; exp: number }
  | { kind: "confirming"; budgetId: number; challenge: string; timestamp: number; exp: number; canvasSignature: string }
  | { kind: "signing"; budgetId: number; challenge: string; timestamp: number; canvasSignature: string; password: string }
  | { kind: "done"; hash: string; fechaFirma: string }
  | { kind: "error"; reason: string };

type Action =
  | { type: "REQUEST_START"; budgetId: number }
  | { type: "REQUEST_OK"; challenge: string; timestamp: number; exp: number }
  | { type: "CANVAS_DONE"; canvasSignature: string }
  | { type: "BACK_TO_DRAWING" }
  | { type: "SUBMIT_START"; password: string }
  | { type: "SUBMIT_OK"; hash: string; fechaFirma: string }
  | { type: "FAIL"; reason: string }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "REQUEST_START":
      return { kind: "requesting", budgetId: action.budgetId };
    case "REQUEST_OK":
      if (state.kind !== "requesting") return state;
      return { kind: "drawing", budgetId: state.budgetId, challenge: action.challenge, timestamp: action.timestamp, exp: action.exp };
    case "CANVAS_DONE":
      if (state.kind !== "drawing") return state;
      return {
        kind: "confirming",
        budgetId: state.budgetId,
        challenge: state.challenge,
        timestamp: state.timestamp,
        exp: state.exp,
        canvasSignature: action.canvasSignature,
      };
    case "BACK_TO_DRAWING":
      if (state.kind !== "confirming") return state;
      return { kind: "drawing", budgetId: state.budgetId, challenge: state.challenge, timestamp: state.timestamp, exp: state.exp };
    case "SUBMIT_START":
      if (state.kind !== "confirming") return state;
      return {
        kind: "signing",
        budgetId: state.budgetId,
        challenge: state.challenge,
        timestamp: state.timestamp,
        canvasSignature: state.canvasSignature,
        password: action.password,
      };
    case "SUBMIT_OK":
      return { kind: "done", hash: action.hash, fechaFirma: action.fechaFirma };
    case "FAIL":
      return { kind: "error", reason: action.reason };
    case "RESET":
      return { kind: "idle" };
    default:
      return state;
  }
}

export function useSignatureFlow(api: BudgetsApi, consentimiento: string) {
  const [state, dispatch] = useReducer(reducer, { kind: "idle" } as State);

  const request = useCallback(async (budgetId: number) => {
    dispatch({ type: "REQUEST_START", budgetId });
    try {
      const { challenge, timestamp, exp } = await api.requestSignatureChallenge(budgetId);
      dispatch({ type: "REQUEST_OK", challenge, timestamp, exp });
    } catch (e) {
      dispatch({ type: "FAIL", reason: (e as { message?: string }).message ?? "Error" });
    }
  }, [api]);

  const submitCanvas = useCallback((canvasSignature: string) => {
    dispatch({ type: "CANVAS_DONE", canvasSignature });
  }, []);

  const back = useCallback(() => dispatch({ type: "BACK_TO_DRAWING" }), []);

  const submit = useCallback(async (password: string) => {
    if (state.kind !== "confirming") return;
    dispatch({ type: "SUBMIT_START", password });
    try {
      const { hash, fechaFirma } = await api.sign(state.budgetId, {
        token: `rp-sig-${state.challenge}`, // actual token is server-derived; client sends challenge
        timestamp: state.timestamp,
        canvasSignature: state.canvasSignature,
        password,
        consentimiento,
      });
      dispatch({ type: "SUBMIT_OK", hash, fechaFirma });
    } catch (e) {
      dispatch({ type: "FAIL", reason: (e as { message?: string }).message ?? "Error" });
    }
  }, [api, state, consentimiento]);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return { state, request, submitCanvas, back, submit, reset };
}
