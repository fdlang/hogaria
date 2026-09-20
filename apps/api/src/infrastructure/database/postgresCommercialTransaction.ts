import pg from "pg";
import type {
  CommercialRepositories,
  ICommercialTransaction,
} from "../../application/use-cases/sales.use-cases.js";
import {
  PostgresEstimateRepository,
  PostgresOpportunityRepository,
  PostgresProjectRepository,
  PostgresUserRepository,
} from "./postgresRepositories.js";

import type { PasswordHasher } from "./inMemoryRepositories.js";

/** Runs every persistence write of a commercial conversion on one connection. */
export class PostgresCommercialTransaction implements ICommercialTransaction {
  constructor(
    private readonly pool: pg.Pool,
    private readonly hasher: PasswordHasher,
  ) {}
  async execute<T>(
    operation: (repositories: CommercialRepositories) => Promise<T>,
    estimateId?: number,
    opportunityId?: number,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (estimateId !== undefined) {
        await client.query("SELECT id FROM estimates WHERE id=$1 FOR UPDATE", [
          estimateId,
        ]);
        await client.query("SELECT o.id FROM opportunities o JOIN estimates e ON e.oportunidad_id=o.id WHERE e.id=$1 FOR UPDATE OF o", [
          estimateId,
        ]);
      }
      if (opportunityId !== undefined)
        await client.query("SELECT id FROM opportunities WHERE id=$1 FOR UPDATE", [
          opportunityId,
        ]);
      const result = await operation({
        users: new PostgresUserRepository(client, this.hasher),
        estimates: new PostgresEstimateRepository(client),
        opportunities: new PostgresOpportunityRepository(client),
        projects: new PostgresProjectRepository(client),
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
