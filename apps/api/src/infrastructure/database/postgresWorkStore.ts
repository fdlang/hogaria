import type { Pool, PoolClient } from "pg";
import { workSeconds, ConflictError } from "@reformapro/domain";
import type {
  WorkEntry,
  WorkRate,
  WorkEvent,
  WorkBudget,
  WorkFilters,
} from "@reformapro/domain";
import type {
  WorkStore,
  WorkRepository,
} from "../../application/use-cases/work-tracking.ports.js";

class PgWorkRepository implements WorkRepository {
  constructor(protected readonly db: Pool | PoolClient) {}
  async rates(id: number): Promise<WorkRate[]> {
    return (
      await this.db.query(
        "SELECT payload FROM work_rates WHERE professional_id=$1 ORDER BY effective_at DESC",
        [id],
      )
    ).rows.map((r) => r.payload);
  }
  async addRate(rate: WorkRate) {
    await this.db.query(
      "INSERT INTO work_rates(id,professional_id,effective_at,payload) VALUES($1,$2,$3,$4)",
      [rate.id, rate.professionalId, rate.effectiveAt, rate],
    );
  }
  async entry(id: string): Promise<WorkEntry | null> {
    return (
      (
        await this.db.query("SELECT payload FROM work_entries WHERE id=$1", [
          id,
        ])
      ).rows[0]?.payload ?? null
    );
  }
  async putEntry(e: WorkEntry) {
    const result = await this.db.query(
      `INSERT INTO work_entries(id,professional_id,project_id,started_at,ended_at,status,seconds,approved_cost_cents,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET started_at=EXCLUDED.started_at,ended_at=EXCLUDED.ended_at,status=EXCLUDED.status,seconds=EXCLUDED.seconds,approved_cost_cents=EXCLUDED.approved_cost_cents,payload=EXCLUDED.payload
      WHERE work_entries.professional_id=EXCLUDED.professional_id AND work_entries.project_id=EXCLUDED.project_id`,
      [
        e.id,
        e.professionalId,
        e.projectId,
        e.startedAt,
        e.endedAt,
        e.status,
        workSeconds(e),
        e.approvedCostCents,
        e,
      ],
    );
    if (result.rowCount !== 1)
      throw new ConflictError("Identificador de operación ya utilizado");
  }
  async openEntry(id: number): Promise<WorkEntry | null> {
    return (
      (
        await this.db.query(
          "SELECT payload FROM work_entries WHERE professional_id=$1 AND status='abierto'",
          [id],
        )
      ).rows[0]?.payload ?? null
    );
  }
  async overlaps(
    id: number,
    start: string,
    end: string | null,
    except: string,
  ) {
    const result = await this.db.query(
      "SELECT 1 FROM work_entries WHERE professional_id=$1 AND id<>$4 AND ($3::timestamptz IS NULL OR started_at<$3) AND (ended_at IS NULL OR ended_at>$2) LIMIT 1",
      [id, start, end, except],
    );
    return result.rows.length > 0;
  }
  async list(f: WorkFilters): Promise<{ items: WorkEntry[]; total: number }> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    for (const [column, operator, value] of [
      ["professional_id", "=", f.professionalId],
      ["project_id", "=", f.projectId],
      ["status", "=", f.status],
      ["started_at", ">=", f.from],
      ["started_at", "<=", f.to],
    ] as const) {
      if (value !== undefined) {
        values.push(value);
        clauses.push(`${column}${operator}$${values.length}`);
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(
      (
        await this.db.query(
          `SELECT count(*) FROM work_entries ${where}`,
          values,
        )
      ).rows[0].count,
    );
    const rows = await this.db.query(
      `SELECT payload FROM work_entries ${where} ORDER BY started_at DESC,id DESC LIMIT 50 OFFSET $${values.length + 1}`,
      [...values, (f.page ?? 0) * 50],
    );
    return { items: rows.rows.map((r) => r.payload), total };
  }
  async event(e: WorkEvent) {
    await this.db.query(
      "INSERT INTO work_events(id,professional_id,entry_id,actor_id,created_at,payload) VALUES($1,$2,$3,$4,$5,$6)",
      [e.id, e.professionalId, e.entryId, e.actorId, e.at, e],
    );
  }
  async events(id: string): Promise<WorkEvent[]> {
    return (
      await this.db.query(
        "SELECT payload FROM work_events WHERE entry_id=$1 ORDER BY sequence",
        [id],
      )
    ).rows.map((r) => r.payload);
  }
  async audit(page: number): Promise<{ items: WorkEvent[]; total: number }> {
    const total = Number(
      (await this.db.query("SELECT count(*) FROM work_events")).rows[0].count,
    );
    return {
      items: (
        await this.db.query(
          "SELECT payload FROM work_events ORDER BY sequence DESC LIMIT 50 OFFSET $1",
          [page * 50],
        )
      ).rows.map((r) => r.payload),
      total,
    };
  }
  async budget(id: number, budget?: WorkBudget): Promise<WorkBudget | null> {
    if (budget)
      await this.db.query(
        "INSERT INTO work_budgets(project_id,payload) VALUES($1,$2) ON CONFLICT(project_id) DO UPDATE SET payload=EXCLUDED.payload",
        [id, budget],
      );
    return (
      (
        await this.db.query(
          "SELECT payload FROM work_budgets WHERE project_id=$1",
          [id],
        )
      ).rows[0]?.payload ?? null
    );
  }
  async summary(id: number) {
    const stats = (
      await this.db.query(
        `SELECT count(*) FILTER(WHERE status='enviado') AS pending,count(*) FILTER(WHERE status='abierto') AS open FROM work_entries WHERE project_id=$1`,
        [id],
      )
    ).rows[0];
    const groups = await this.db.query(
      `SELECT professional_id, max(payload->>'professionalName') AS name,max(payload->>'profession') AS profession,sum(seconds)/3600.0 AS hours,sum(approved_cost_cents) AS cost FROM work_entries WHERE project_id=$1 AND status='aprobado' GROUP BY professional_id ORDER BY professional_id`,
      [id],
    );
    const byProfessional = groups.rows.map((r) => ({
      professionalId: Number(r.professional_id),
      name: String(r.name),
      profession: String(r.profession),
      hours: Number(r.hours),
      costCents: Number(r.cost),
    }));
    return {
      approvedHours: byProfessional.reduce((s, g) => s + g.hours, 0),
      approvedCostCents: byProfessional.reduce((s, g) => s + g.costCents, 0),
      pending: Number(stats.pending),
      open: Number(stats.open),
      byProfessional,
    };
  }
}
export class PostgresWorkStore extends PgWorkRepository implements WorkStore {
  constructor(private readonly pool: Pool) {
    super(pool);
  }
  async transaction<T>(
    key: number,
    operation: (repo: WorkRepository) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('work:' || $1::text,0))",
        [String(key)],
      );
      const result = await operation(new PgWorkRepository(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
