import pg from "pg";
import type { CommercialRepositories, ICommercialTransaction } from "../../application/use-cases/sales.use-cases.js";
import { PostgresEstimateRepository, PostgresOpportunityRepository, PostgresProjectRepository } from "./postgresRepositories.js";

/** Runs every persistence write of a commercial conversion on one connection. */
export class PostgresCommercialTransaction implements ICommercialTransaction {
  constructor(private readonly pool: pg.Pool) {}
  async execute<T>(operation: (repositories: CommercialRepositories) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation({
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
