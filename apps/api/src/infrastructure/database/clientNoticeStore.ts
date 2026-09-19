import type { Pool } from "pg";
import type {
  Notice,
  NoticeStore,
} from "../../application/notifications/client-notifications.js";
export class PostgresNoticeStore implements NoticeStore {
  constructor(private readonly pool: Pool) {}
  async enqueue(notice: Notice) {
    await this.pool.query(
      "INSERT INTO client_email_notifications (id,payload) VALUES ($1,$2::jsonb) ON CONFLICT(id) DO NOTHING",
      [notice.id, JSON.stringify(notice)],
    );
  }
  async claim(id?: string) {
    // Never replay an ambiguous delivery outside the provider's 24h key window.
    await this.pool.query(
      "UPDATE client_email_notifications SET state='failed',failure_reason=CASE WHEN first_attempt_at < now()-interval '23 hours' THEN 'idempotency_window_expired' ELSE 'attempts_exhausted' END WHERE state IN ('pending','sending') AND (first_attempt_at < now()-interval '23 hours' OR (attempts>=5 AND next_attempt_at<=now()))",
    );
    const result = await this.pool.query(
      `WITH candidate AS (
   SELECT id FROM client_email_notifications
   WHERE state IN ('pending','sending') AND attempts<5 AND next_attempt_at<=now()
   AND ($1::uuid IS NULL OR id=$1::uuid)
   ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE client_email_notifications n SET state='sending',first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1,next_attempt_at=now()+interval '2 minutes',updated_at=now()
  FROM candidate c WHERE n.id=c.id RETURNING n.payload`,
      [id ?? null],
    );
    return (result.rows[0]?.payload as Notice | undefined) ?? null;
  }
  async finish(
    id: string,
    state: "accepted" | "skipped" | "pending",
    providerId?: string,
  ) {
    await this.pool.query(
      `UPDATE client_email_notifications SET state=CASE WHEN $2='pending' AND attempts>=5 THEN 'failed' ELSE $2 END,
   provider_id=$3,next_attempt_at=now()+interval '15 minutes',updated_at=now() WHERE id=$1`,
      [id, state, providerId ?? null],
    );
  }
}
export class MemoryNoticeStore implements NoticeStore {
  private rows = new Map<
    string,
    { notice: Notice; state: string; attempts: number; next: number }
  >();
  async enqueue(notice: Notice) {
    if (!this.rows.has(notice.id))
      this.rows.set(notice.id, {
        notice,
        state: "pending",
        attempts: 0,
        next: 0,
      });
  }
  async claim(id?: string) {
    const row = [...this.rows.values()].find(
      (r) =>
        (!id || r.notice.id === id) &&
        ["pending", "sending"].includes(r.state) &&
        r.attempts < 5 &&
        r.next <= Date.now(),
    );
    if (!row) return null;
    row.state = "sending";
    row.attempts++;
    row.next = Date.now() + 120000;
    return row.notice;
  }
  async finish(id: string, state: "accepted" | "skipped" | "pending") {
    const row = this.rows.get(id);
    if (row) {
      row.state = state === "pending" && row.attempts >= 5 ? "failed" : state;
      row.next = Date.now() + 900000;
    }
  }
}
