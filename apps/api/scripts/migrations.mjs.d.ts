export const MIGRATIONS: readonly string[];
export function normalizeMigrationSql(sql: string): string;
export function migrationChecksum(sql: string): string;
export function migrationChecksumCandidates(name: string, sql: string): Set<string>;
export function applyMigrations(
  pool: { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> },
  load?: (name: string) => Promise<string>,
): Promise<string[]>;
