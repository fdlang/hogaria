import { workSeconds } from "@reformapro/domain";
import type {
  WorkEntry,
  WorkRate,
  WorkEvent,
  WorkBudget,
  WorkFilters,
  WorkSummary,
} from "@reformapro/domain";
import type {
  WorkStore,
  WorkRepository,
} from "../../application/use-cases/work-tracking.ports.js";

export class MemoryWorkStore implements WorkStore {
  private entries = new Map<string, WorkEntry>();
  private tariffs: WorkRate[] = [];
  private log: WorkEvent[] = [];
  private budgets = new Map<number, WorkBudget>();
  private tail: Promise<void> = Promise.resolve();
  async transaction<T>(
    _key: number,
    operation: (repo: WorkRepository) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = structuredClone([
      this.entries,
      this.tariffs,
      this.log,
      this.budgets,
    ] as const);
    try {
      return await operation(this);
    } catch (error) {
      [this.entries, this.tariffs, this.log, this.budgets] = snapshot;
      throw error;
    } finally {
      release();
    }
  }
  async rates(id: number) {
    return structuredClone(
      this.tariffs
        .filter((r) => r.professionalId === id)
        .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt)),
    );
  }
  async addRate(rate: WorkRate) {
    this.tariffs.push(structuredClone(rate));
  }
  async entry(id: string) {
    return structuredClone(this.entries.get(id) ?? null);
  }
  async putEntry(entry: WorkEntry) {
    this.entries.set(entry.id, structuredClone(entry));
  }
  async openEntry(id: number) {
    return structuredClone(
      [...this.entries.values()].find(
        (e) => e.professionalId === id && e.status === "abierto",
      ) ?? null,
    );
  }
  async overlaps(
    id: number,
    start: string,
    end: string | null,
    except: string,
  ) {
    return [...this.entries.values()].some(
      (e) =>
        e.id !== except &&
        e.professionalId === id &&
        (!end || e.startedAt < end) &&
        (!e.endedAt || e.endedAt > start),
    );
  }
  async list(filters: WorkFilters) {
    const all = [...this.entries.values()]
      .filter(
        (e) =>
          (!filters.professionalId ||
            e.professionalId === filters.professionalId) &&
          (!filters.projectId || e.projectId === filters.projectId) &&
          (!filters.status || e.status === filters.status) &&
          (!filters.from || e.startedAt >= filters.from) &&
          (!filters.to || e.startedAt <= filters.to),
      )
      .sort(
        (a, b) =>
          b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id),
      );
    return {
      items: structuredClone(
        all.slice((filters.page ?? 0) * 50, (filters.page ?? 0) * 50 + 50),
      ),
      total: all.length,
    };
  }
  async event(event: WorkEvent) {
    this.log.push(structuredClone(event));
  }
  async events(id: string) {
    return structuredClone(this.log.filter((e) => e.entryId === id));
  }
  async audit(page: number) {
    return {
      items: structuredClone(
        [...this.log].reverse().slice(page * 50, page * 50 + 50),
      ),
      total: this.log.length,
    };
  }
  async budget(id: number, budget?: WorkBudget) {
    if (budget) this.budgets.set(id, structuredClone(budget));
    return structuredClone(this.budgets.get(id) ?? null);
  }
  async summary(id: number) {
    const entries = [...this.entries.values()].filter(
      (e) => e.projectId === id,
    );
    const groups = new Map<number, WorkSummary["byProfessional"][number]>();
    for (const e of entries.filter((e) => e.status === "aprobado")) {
      const group = groups.get(e.professionalId) ?? {
        professionalId: e.professionalId,
        name: e.professionalName,
        profession: e.profession,
        hours: 0,
        costCents: 0,
      };
      group.hours += workSeconds(e) / 3600;
      group.costCents += e.approvedCostCents ?? 0;
      groups.set(e.professionalId, group);
    }
    const byProfessional = [...groups.values()];
    return {
      approvedHours: byProfessional.reduce((s, g) => s + g.hours, 0),
      approvedCostCents: byProfessional.reduce((s, g) => s + g.costCents, 0),
      pending: entries.filter((e) => e.status === "enviado").length,
      open: entries.filter((e) => e.status === "abierto").length,
      byProfessional,
    };
  }
}
