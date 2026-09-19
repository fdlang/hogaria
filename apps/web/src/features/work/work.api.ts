import type {
  Engagement,
  RateUnit,
  PublicWorkEntry,
  WorkEntry,
  WorkRate,
  WorkEvent,
  WorkSummary,
  WorkFilters,
} from "@reformapro/domain";
import type { ApiClient } from "@/shared/lib/api-client";
export type Entry = PublicWorkEntry &
  Partial<Pick<WorkEntry, "rate" | "approvedCostCents">>;
export interface CurrentWork {
  engagement: Engagement | null;
  rateUnit: RateUnit | null;
  unitLabel: string | null;
  open: PublicWorkEntry | null;
}
export class WorkApi {
  constructor(private readonly http: ApiClient) {}
  current(): Promise<CurrentWork> {
    return this.http.get("/work/current");
  }
  audit(page: number): Promise<{ items: WorkEvent[]; total: number }> {
    return this.http.get(`/work/audit?page=${page}`);
  }
  list(
    filters: WorkFilters,
  ): Promise<{
    items: Entry[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
    return this.http.get(`/work/entries?${query}`);
  }
  start(input: Record<string, unknown>): Promise<Entry> {
    return this.http.post("/work/start", input);
  }
  part(input: Record<string, unknown>): Promise<Entry> {
    return this.http.post("/work/parts", input);
  }
  action(entry: Entry, input: Record<string, unknown>): Promise<Entry> {
    return this.http.post(`/work/entries/${entry.id}/actions`, {
      ...input,
      revision: entry.revision,
    });
  }
  history(id: string): Promise<WorkEvent[]> {
    return this.http.get(`/work/entries/${id}/history`);
  }
  rates(id: number): Promise<WorkRate[]> {
    return this.http.get(`/work/professionals/${id}/rates`);
  }
  configure(id: number, input: Record<string, unknown>): Promise<WorkRate> {
    return this.http.post(`/work/professionals/${id}/rates`, input);
  }
  summary(id: number): Promise<WorkSummary> {
    return this.http.get(`/work/projects/${id}/summary`);
  }
  budget(id: number, input: Record<string, unknown>): Promise<unknown> {
    return this.http.post(`/work/projects/${id}/budget`, input);
  }
}
