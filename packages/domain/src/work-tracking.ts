export type Engagement = "empleado" | "autonomo" | "subcontrata";
export type RateUnit = "hora" | "jornada" | "unidad";
export type WorkStatus = "abierto" | "enviado" | "aprobado" | "rechazado";
export interface WorkRate {
  id: string;
  professionalId: number;
  engagement: Engagement;
  rateUnit: RateUnit;
  rateCents: number;
  unitLabel: string;
  effectiveAt: string;
  createdAt: string;
}
export interface WorkPause {
  startedAt: string;
  endedAt: string | null;
}
export interface WorkEntry {
  id: string;
  professionalId: number;
  professionalName: string;
  profession: string;
  projectId: number;
  projectName: string;
  kind: "jornada" | "parte";
  startedAt: string;
  endedAt: string | null;
  pauses: WorkPause[];
  breakSeconds: number;
  units: number | null;
  unitLabel: string;
  notes: string;
  status: WorkStatus;
  revision: number;
  rate: WorkRate;
  approvedCostCents: number | null;
  approvedBy: number | null;
  approvedAt: string | null;
  reviewReason: string;
  createdAt: string;
}
export type PublicWorkEntry = Omit<WorkEntry, "rate" | "approvedCostCents">;
export interface WorkEvent {
  id: string;
  professionalId: number;
  entryId: string | null;
  actorId: number;
  action: string;
  at: string;
  reason: string;
  before: unknown;
  after: unknown;
}
export interface WorkBudget {
  projectId: number;
  plannedHours: number;
  plannedCostCents: number;
}
export interface WorkSummary {
  projectId: number;
  approvedHours: number;
  approvedCostCents: number;
  pending: number;
  open: number;
  budget: WorkBudget | null;
  hoursDeviation: number | null;
  costDeviationCents: number | null;
  byProfessional: Array<{
    professionalId: number;
    name: string;
    profession: string;
    hours: number;
    costCents: number;
  }>;
}
export interface WorkFilters {
  professionalId?: number;
  projectId?: number;
  status?: WorkStatus;
  from?: string;
  to?: string;
  page?: number;
}
export function workSeconds(
  entry: Pick<WorkEntry, "startedAt" | "endedAt" | "breakSeconds" | "pauses">,
): number {
  if (!entry.endedAt) return 0;
  const paused = entry.pauses.reduce(
    (sum, pause) =>
      sum +
      (Date.parse(pause.endedAt ?? entry.endedAt!) -
        Date.parse(pause.startedAt)),
    0,
  );
  return Math.max(
    0,
    Math.floor(
      (Date.parse(entry.endedAt) -
        Date.parse(entry.startedAt) -
        paused -
        Math.round(entry.breakSeconds * 1000)) /
        1000,
    ),
  );
}
export function workCostCents(entry: WorkEntry): number {
  return Math.round(
    (entry.rate.rateUnit === "hora"
      ? workSeconds(entry) / 3600
      : (entry.units ?? 0)) * entry.rate.rateCents,
  );
}
