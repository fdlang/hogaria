import pg from "pg";
import { ConflictError } from "@reformapro/domain/errors";
import type {
  ActivationToken,
  IActivationTokenRepository,
} from "../../application/use-cases/account-activation.use-cases.js";
import type { InMemoryUserRepository } from "./inMemoryRepositories.js";
const invalid = () =>
  new ConflictError("El enlace ha caducado, ya se utilizó o no es válido");
export class InMemoryActivationTokenRepository
  implements IActivationTokenRepository
{
  private items: ActivationToken[] = [];
  private readonly revisions = new Map<string, number>();
  constructor(
    private readonly users: Pick<InMemoryUserRepository, "activateAccount" | "activationRevision">,
  ) {}
  async reserve(token: ActivationToken, now: Date) {
    const expired = this.items.filter((item) => item.expiresAt <= now || item.usedAt);
    expired.forEach((item) => this.revisions.delete(item.tokenHash));
    this.items = this.items.filter((item) => item.expiresAt > now && !item.usedAt);
    if (this.items.some(item => item.userId === token.userId && !item.usedAt && item.expiresAt > now)) return false;
    await this.stage(token);
    return true;
  }
  async stage(token: ActivationToken) {
    this.items.push(token);
    this.revisions.set(token.tokenHash, this.users.activationRevision(token.userId));
  }
  async promote(userId: number, tokenHash: string) {
    if (!this.items.some(token => token.userId === userId && token.tokenHash === tokenHash)) return;
    for (const old of this.items) if (old.userId === userId && old.tokenHash !== tokenHash) this.revisions.delete(old.tokenHash);
    this.items = this.items.filter(token => token.userId !== userId || token.tokenHash === tokenHash);
  }
  async discard(tokenHash: string) {
    this.items = this.items.filter(token => token.tokenHash !== tokenHash);
    this.revisions.delete(tokenHash);
  }
  async findValid(hash: string, now: Date) {
    return (
      this.items.find(
        (t) => t.tokenHash === hash && !t.usedAt && t.expiresAt > now && this.revisions.get(hash) === this.users.activationRevision(t.userId),
      ) ?? null
    );
  }
  async complete(hash: string, passwordHash: string) {
    const index = this.items.findIndex(
      (t) => t.tokenHash === hash && !t.usedAt && t.expiresAt > new Date(),
    );
    const token = this.items[index];
    if (!token) throw invalid();
    if (this.revisions.get(hash) !== this.users.activationRevision(token.userId)) throw invalid();
    this.users.activateAccount(token.userId, passwordHash);
    for (const item of this.items) if (item.userId === token.userId) this.revisions.delete(item.tokenHash);
    this.items = this.items.filter(item => item.userId !== token.userId);
  }
}
export class PostgresActivationTokenRepository
  implements IActivationTokenRepository
{
  constructor(private readonly pool: pg.Pool) {}
  async reserve(token: ActivationToken, now: Date) {
    return this.transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [token.userId]);
      await client.query("DELETE FROM account_activation_tokens WHERE expires_at<=$1 OR used_at IS NOT NULL", [now]);
      const current = await client.query("SELECT 1 FROM account_activation_tokens WHERE user_id=$1 AND used_at IS NULL AND expires_at>$2 LIMIT 1", [token.userId, now]);
      if (current.rowCount === 1) return false;
      await client.query(
        "INSERT INTO account_activation_tokens(user_id,token_hash,expires_at,used_at) VALUES($1,$2,$3,$4)",
        [token.userId, token.tokenHash, token.expiresAt, token.usedAt],
      );
      return true;
    });
  }
  private async transaction<T>(fn: (client: pg.PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async stage(token: ActivationToken) {
    await this.pool.query(
      "INSERT INTO account_activation_tokens(user_id,token_hash,expires_at,used_at) VALUES($1,$2,$3,$4)",
      [token.userId, token.tokenHash, token.expiresAt, token.usedAt],
    );
  }
  async promote(userId: number, tokenHash: string) {
    await this.transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      await client.query(
        "DELETE FROM account_activation_tokens WHERE user_id=$1 AND token_hash<>$2 AND EXISTS (SELECT 1 FROM account_activation_tokens target WHERE target.user_id=$1 AND target.token_hash=$2)",
        [userId, tokenHash],
      );
    });
  }
  async discard(tokenHash: string) {
    await this.pool.query("DELETE FROM account_activation_tokens WHERE token_hash=$1", [tokenHash]);
  }
  async findValid(hash: string, now: Date) {
    const { rows } = await this.pool.query(
      "SELECT * FROM account_activation_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2",
      [hash, now],
    );
    const row = rows[0];
    return row
      ? {
          userId: Number(row.user_id),
          tokenHash: row.token_hash,
          expiresAt: new Date(row.expires_at),
          usedAt: row.used_at ? new Date(row.used_at) : null,
        }
      : null;
  }
  async complete(hash: string, passwordHash: string) {
    await this.transaction(async (client) => {
      await client.query(
        "SELECT u.id FROM users u JOIN account_activation_tokens t ON t.user_id=u.id WHERE t.token_hash=$1 FOR UPDATE OF u",
        [hash],
      );
      const result = await client.query(
        "DELETE FROM account_activation_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>clock_timestamp() RETURNING user_id",
        [hash],
      );
      if (result.rowCount !== 1) throw invalid();
      await client.query(
        "DELETE FROM account_activation_tokens WHERE user_id=$1",
        [result.rows[0].user_id],
      );
      const updated = await client.query(
        "UPDATE users SET password_hash=$2,activo=true,account_status='active',session_version=session_version+1 WHERE id=$1 AND rol IN ('admin','cliente','profesional') RETURNING id",
        [result.rows[0].user_id, passwordHash],
      );
      if (updated.rowCount !== 1) throw invalid();
    });
  }
}
