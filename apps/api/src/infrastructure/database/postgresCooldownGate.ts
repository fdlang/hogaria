import pg from "pg";
import type { ICooldownGate } from "../../application/use-cases/solicitud.use-cases.js";
import { RATE_LIMIT_POLICY } from "@reformapro/domain";

/** Shared, atomic limiter for serverless instances backed by PostgreSQL. */
export class PostgresCooldownGate implements ICooldownGate {
  constructor(private readonly pool: pg.Pool) {}
  async check(key: string, limit: number, windowMs: number): Promise<boolean> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    const pseudonymousKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    await this.pool.query(
      "DELETE FROM rate_limit_windows WHERE window_started_at <= NOW() - ($1 * INTERVAL '1 millisecond')",
      [RATE_LIMIT_POLICY.retentionMs],
    );
    const result = await this.pool.query(
      `INSERT INTO rate_limit_windows (key, window_started_at, hits)
       VALUES ($1, NOW(), 1)
       ON CONFLICT (key) DO UPDATE SET
         window_started_at = CASE WHEN rate_limit_windows.window_started_at <= NOW() - ($3 * INTERVAL '1 millisecond') THEN NOW() ELSE rate_limit_windows.window_started_at END,
         hits = CASE WHEN rate_limit_windows.window_started_at <= NOW() - ($3 * INTERVAL '1 millisecond') THEN 1 ELSE rate_limit_windows.hits + 1 END
       WHERE rate_limit_windows.window_started_at <= NOW() - ($3 * INTERVAL '1 millisecond') OR rate_limit_windows.hits < $2
       RETURNING hits`,
      [pseudonymousKey, limit, windowMs],
    );
    return result.rowCount === 1;
  }
}
