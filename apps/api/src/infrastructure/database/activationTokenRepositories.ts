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
  constructor(
    private readonly users: Pick<InMemoryUserRepository, "activateAccount">,
  ) {}
  async replace(token: ActivationToken) {
    this.items = this.items.filter((t) => t.userId !== token.userId);
    this.items.push(token);
  }
  async findValid(hash: string, now: Date) {
    return (
      this.items.find(
        (t) => t.tokenHash === hash && !t.usedAt && t.expiresAt > now,
      ) ?? null
    );
  }
  async complete(hash: string, passwordHash: string) {
    const index = this.items.findIndex(
      (t) => t.tokenHash === hash && !t.usedAt && t.expiresAt > new Date(),
    );
    const token = this.items[index];
    if (!token) throw invalid();
    this.users.activateAccount(token.userId, passwordHash);
    this.items.splice(index, 1);
  }
}
export class PostgresActivationTokenRepository
  implements IActivationTokenRepository
{
  constructor(private readonly pool: pg.Pool) {}
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
  async replace(token: ActivationToken) {
    await this.transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        token.userId,
      ]);
      await client.query(
        "DELETE FROM account_activation_tokens WHERE user_id=$1",
        [token.userId],
      );
      await client.query(
        "INSERT INTO account_activation_tokens(user_id,token_hash,expires_at,used_at) VALUES($1,$2,$3,$4)",
        [token.userId, token.tokenHash, token.expiresAt, token.usedAt],
      );
    });
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
      const updated = await client.query(
        "UPDATE users SET password_hash=$2,activo=true WHERE id=$1 AND rol IN ('cliente','profesional') RETURNING id",
        [result.rows[0].user_id, passwordHash],
      );
      if (updated.rowCount !== 1) throw invalid();
    });
  }
}
