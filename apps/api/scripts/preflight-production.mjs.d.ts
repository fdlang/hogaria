export interface PreflightResult { errors: string[]; warnings: string[]; }
export interface SignatureInventory { v1: number; v2: number; v3: number; unknown: number; v3KeyIds: string[]; }
export function inspectProductionEnvironment(env: NodeJS.ProcessEnv): PreflightResult;
export function assessSignatureInventory(inventory: SignatureInventory, env: NodeJS.ProcessEnv): PreflightResult;
export function inspectProductionDatabase(pool: { query(sql: string): Promise<{ rows: Record<string, any>[] }> }, env: NodeJS.ProcessEnv): Promise<PreflightResult & { signatures: SignatureInventory }>;
export function runProductionPreflight(env?: NodeJS.ProcessEnv): Promise<PreflightResult & { signatures: SignatureInventory | null }>;
