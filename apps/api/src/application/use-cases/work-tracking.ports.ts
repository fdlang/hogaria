import type {
  WorkRate,
  WorkEntry,
  WorkEvent,
  WorkBudget,
  WorkFilters,
  WorkSummary,
} from "@reformapro/domain";
export interface WorkRepository {
  rates(professionalId: number): Promise<WorkRate[]>;
  addRate(rate: WorkRate): Promise<void>;
  entry(id: string): Promise<WorkEntry | null>;
  putEntry(entry: WorkEntry): Promise<void>;
  openEntry(professionalId: number): Promise<WorkEntry | null>;
  overlaps(
    professionalId: number,
    start: string,
    end: string | null,
    exceptId: string,
  ): Promise<boolean>;
  list(filters: WorkFilters): Promise<{ items: WorkEntry[]; total: number }>;
  event(event: WorkEvent): Promise<void>;
  events(entryId: string): Promise<WorkEvent[]>;
  audit(page: number): Promise<{ items: WorkEvent[]; total: number }>;
  budget(projectId: number, budget?: WorkBudget): Promise<WorkBudget | null>;
  summary(
    projectId: number,
  ): Promise<
    Pick<
      WorkSummary,
      | "approvedHours"
      | "approvedCostCents"
      | "pending"
      | "open"
      | "byProfessional"
    >
  >;
}
export interface WorkStore extends WorkRepository {
  transaction<T>(
    key: number,
    operation: (repo: WorkRepository) => Promise<T>,
  ): Promise<T>;
}
