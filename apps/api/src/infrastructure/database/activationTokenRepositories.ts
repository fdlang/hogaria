import pg from "pg";
import type { ActivationToken, IActivationTokenRepository } from "../../application/use-cases/account-activation.use-cases.js";

export class InMemoryActivationTokenRepository implements IActivationTokenRepository {
  private items: ActivationToken[] = [];
  async replace(token: ActivationToken) { this.items = this.items.filter(item => item.userId !== token.userId); this.items.push(token); }
  async findValid(tokenHash: string, now: Date) { return this.items.find(item => item.tokenHash === tokenHash && !item.usedAt && item.expiresAt > now) ?? null; }
  async consume(tokenHash: string) {
    const index = this.items.findIndex(item => item.tokenHash === tokenHash && !item.usedAt);
    if (index < 0) throw new Error("Activation token already used");
    this.items.splice(index, 1);
  }
}

export class PostgresActivationTokenRepository implements IActivationTokenRepository {
  constructor(private readonly pool: pg.Pool) {}
  async replace(token: ActivationToken) { await this.pool.query("DELETE FROM account_activation_tokens WHERE user_id=$1", [token.userId]); await this.pool.query("INSERT INTO account_activation_tokens(user_id,token_hash,expires_at,used_at) VALUES($1,$2,$3,$4)", [token.userId, token.tokenHash, token.expiresAt, token.usedAt]); }
  async findValid(tokenHash: string, now: Date) { const result = await this.pool.query("SELECT user_id,token_hash,expires_at,used_at FROM account_activation_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2", [tokenHash, now]); const row = result.rows[0]; return row ? { userId: Number(row.user_id), tokenHash: row.token_hash, expiresAt: new Date(row.expires_at), usedAt: row.used_at ? new Date(row.used_at) : null } : null; }
  async consume(tokenHash: string) {
    // DELETE ... RETURNING is an atomic compare-and-delete. Only one concurrent
    // activation request can consume a token; later requests observe no record.
    const result = await this.pool.query("DELETE FROM account_activation_tokens WHERE token_hash=$1 AND used_at IS NULL RETURNING user_id", [tokenHash]);
    if (result.rowCount !== 1) throw new Error("Activation token already used");
  }
}
