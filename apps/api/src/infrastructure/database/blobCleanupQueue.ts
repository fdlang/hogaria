import type { Pool } from "pg";
import type { IBlobCleanupQueue } from "../../application/use-cases/file.use-cases.js";

export class PostgresBlobCleanupQueue implements IBlobCleanupQueue {
  constructor(private readonly pool: Pool) {}
  async stage(storageKey: string): Promise<void> {
    await this.pool.query("INSERT INTO blob_cleanup_jobs(storage_key,next_attempt_at) VALUES($1,now() + interval '30 minutes') ON CONFLICT(storage_key) DO NOTHING", [storageKey]);
  }
  async find(limit: number): Promise<Array<{ storageKey: string }>> {
    const result = await this.pool.query("SELECT storage_key FROM blob_cleanup_jobs WHERE next_attempt_at<=now() ORDER BY next_attempt_at,created_at LIMIT $1", [limit]);
    return result.rows.map(row => ({ storageKey: String(row.storage_key) }));
  }
  async remove(storageKey: string): Promise<void> {
    await this.pool.query("DELETE FROM blob_cleanup_jobs WHERE storage_key=$1", [storageKey]);
  }
  async fail(storageKey: string, reason: string): Promise<void> {
    await this.pool.query("UPDATE blob_cleanup_jobs SET attempts=attempts+1,last_error=$2,next_attempt_at=now() + LEAST(interval '1 hour', interval '1 minute' * power(2, LEAST(attempts, 6))) WHERE storage_key=$1", [storageKey, reason.slice(0, 500)]);
  }
}

export class InMemoryBlobCleanupQueue implements IBlobCleanupQueue {
  private readonly keys = new Map<string, number>();
  async stage(storageKey: string): Promise<void> { if (!this.keys.has(storageKey)) this.keys.set(storageKey, 0); }
  async find(limit: number): Promise<Array<{ storageKey: string }>> { return [...this.keys].sort((a,b) => a[1]-b[1]).slice(0, limit).map(([storageKey]) => ({ storageKey })); }
  async remove(storageKey: string): Promise<void> { this.keys.delete(storageKey); }
  async fail(storageKey: string): Promise<void> { if (this.keys.has(storageKey)) this.keys.set(storageKey, Date.now()); }
}
