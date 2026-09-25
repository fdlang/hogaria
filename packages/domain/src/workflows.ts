import type { OpportunityStatus } from "./entities/index.js";

export type OpportunityTransitionReason = "manual" | "signed_conversion";

const OPPORTUNITY_TRANSITIONS: Readonly<Record<OpportunityStatus, readonly OpportunityStatus[]>> = {
  nueva: ["contactada", "en_estudio", "descartada"],
  contactada: ["visita_agendada", "en_estudio", "descartada"],
  visita_agendada: ["en_estudio", "descartada"],
  en_estudio: ["descartada"],
  ganada: [],
  descartada: [],
};

export function canTransitionOpportunity(
  from: OpportunityStatus,
  to: OpportunityStatus,
  reason: OpportunityTransitionReason = "manual",
): boolean {
  if (from === to) return true;
  if (to === "ganada") return from === "en_estudio" && reason === "signed_conversion";
  return OPPORTUNITY_TRANSITIONS[from].includes(to);
}

export function isOpenOpportunity(status: OpportunityStatus): boolean {
  return status !== "ganada" && status !== "descartada";
}

export type ProjectReadinessRequirement =
  | "end_after_start"
  | "assigned_professional"
  | "milestone";

export interface ProjectReadinessInput {
  fechaInicio: Date;
  fechaFinPrevista: Date;
  profesionalesAsignados: readonly { userId: number }[];
  hitos: readonly { id: string }[];
}

export function canStartProject(input: ProjectReadinessInput): {
  ready: boolean;
  missing: ProjectReadinessRequirement[];
} {
  const missing: ProjectReadinessRequirement[] = [];
  if (input.fechaFinPrevista.getTime() <= input.fechaInicio.getTime()) missing.push("end_after_start");
  if (input.profesionalesAsignados.length === 0) missing.push("assigned_professional");
  if (input.hitos.length === 0) missing.push("milestone");
  return { ready: missing.length === 0, missing };
}

export function projectStateViolation(
  state: "planificacion" | "en_curso" | "pausado" | "finalizado",
  progress: number,
): "finalized_progress" | null {
  return state === "finalizado" && progress !== 100 ? "finalized_progress" : null;
}
