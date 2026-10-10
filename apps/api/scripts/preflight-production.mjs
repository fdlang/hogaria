import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { MIGRATIONS, migrationChecksum } from "./migrations.mjs";

const REQUIRED_SECRETS = ["HMAC_SECRET", "SIGNATURE_HMAC_SECRET"];

export function inspectProductionEnvironment(env) {
  const errors = [];
  const warnings = [];
  for (const name of ["DATABASE_URL", "SIGNATURE_HMAC_KEY_ID", ...REQUIRED_SECRETS]) {
    if (!env[name]) errors.push(`${name} no esta configurada`);
  }
  for (const name of REQUIRED_SECRETS) {
    if (env[name] && env[name].length < 32) errors.push(`${name} debe tener al menos 32 caracteres`);
  }
  if (env.HMAC_SECRET && env.HMAC_SECRET === env.SIGNATURE_HMAC_SECRET) errors.push("HMAC_SECRET y SIGNATURE_HMAC_SECRET deben ser distintos");
  if (env.SIGNATURE_HMAC_KEY_ID && !/^[A-Za-z0-9_-]{1,32}$/.test(env.SIGNATURE_HMAC_KEY_ID)) errors.push("SIGNATURE_HMAC_KEY_ID tiene un formato invalido");
  if (env.SIGNATURE_HMAC_LEGACY_V2_SECRET) {
    if (env.SIGNATURE_HMAC_LEGACY_V2_SECRET.length < 32) errors.push("SIGNATURE_HMAC_LEGACY_V2_SECRET debe tener al menos 32 caracteres");
    if (env.SIGNATURE_HMAC_LEGACY_V2_SECRET === env.HMAC_SECRET) errors.push("La clave legacy v2 no puede ser la clave de sesiones actual");
  }
  if (env.CRON_SECRET && env.CRON_SECRET.length < 32) errors.push("CRON_SECRET debe tener al menos 32 caracteres");
  if (env.NOTIFICATION_RETRY_SECRET && env.NOTIFICATION_RETRY_SECRET.length < 32) errors.push("NOTIFICATION_RETRY_SECRET debe tener al menos 32 caracteres");
  if (env.CRON_SECRET && env.CRON_SECRET === env.NOTIFICATION_RETRY_SECRET) errors.push("CRON_SECRET y NOTIFICATION_RETRY_SECRET deben ser distintos");
  if (env.CLIENT_NOTIFICATIONS_ENABLED === "true") {
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM", "APP_URL", "CRON_SECRET"]) {
      if (!env[name]) errors.push(`${name} es obligatoria con las notificaciones activas`);
    }
  }
  if (!env.BLOB_READ_WRITE_TOKEN) warnings.push("BLOB_READ_WRITE_TOKEN no esta configurada; las cargas privadas no funcionaran");
  return { errors, warnings };
}

function configuredSignatureKeyIds(env) {
  const ids = new Set(env.SIGNATURE_HMAC_KEY_ID ? [env.SIGNATURE_HMAC_KEY_ID] : []);
  if (!env.SIGNATURE_HMAC_PREVIOUS_KEYS) return { ids, error: null };
  try {
    const previous = JSON.parse(env.SIGNATURE_HMAC_PREVIOUS_KEYS);
    if (!previous || Array.isArray(previous) || typeof previous !== "object") throw new Error();
    for (const [id, secret] of Object.entries(previous)) {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || typeof secret !== "string" || secret.length < 32) throw new Error();
      ids.add(id);
    }
    return { ids, error: null };
  } catch {
    return { ids, error: "SIGNATURE_HMAC_PREVIOUS_KEYS no contiene un objeto de claves valido" };
  }
}

export function assessSignatureInventory(inventory, env) {
  const errors = [];
  const warnings = [];
  const keyring = configuredSignatureKeyIds(env);
  if (keyring.error) errors.push(keyring.error);
  if (inventory.v1 > 0) errors.push(`${inventory.v1} firma(s) v1 no estan vinculadas criptograficamente al documento`);
  const v2UsesSessionKey = env.SIGNATURE_HMAC_LEGACY_V2_USE_SESSION_KEY === "true";
  if (inventory.v2 > 0 && !env.SIGNATURE_HMAC_LEGACY_V2_SECRET && !v2UsesSessionKey) errors.push(`${inventory.v2} firma(s) v2 requieren una clave legacy verificable`);
  if (inventory.v2 > 0 && v2UsesSessionKey) warnings.push(`${inventory.v2} firma(s) v2 usan temporalmente la clave de sesion; desactiva la compatibilidad cuando dejen de ser necesarias`);
  if (inventory.unknown > 0) errors.push(`${inventory.unknown} firma(s) tienen un formato desconocido o incompleto`);
  const missingIds = inventory.v3KeyIds.filter((id) => !keyring.ids.has(id));
  if (missingIds.length) errors.push(`Faltan claves de verificacion v3 para: ${missingIds.join(", ")}`);
  if (inventory.v2 === 0 && env.SIGNATURE_HMAC_LEGACY_V2_SECRET) warnings.push("La clave legacy v2 esta configurada aunque no hay firmas v2");
  return { errors, warnings };
}

async function expectedMigrationChecksums() {
  const entries = await Promise.all(MIGRATIONS.map(async (name) => {
    const sql = await readFile(new URL(`../database/${name}`, import.meta.url), "utf8");
    return [name, migrationChecksum(sql)];
  }));
  return new Map(entries);
}

export async function inspectProductionDatabase(pool, env) {
  const errors = [];
  const warnings = [];
  const relations = (await pool.query("SELECT to_regclass('public.schema_migrations') AS ledger, to_regclass('public.budget_versions') AS versions")).rows[0];
  if (!relations?.ledger) errors.push("No existe schema_migrations; ejecuta el runner versionado antes del despliegue");
  if (!relations?.versions) errors.push("No existe budget_versions; el esquema no esta completo");

  if (relations?.ledger) {
    const expected = await expectedMigrationChecksums();
    const applied = new Map((await pool.query("SELECT name, checksum FROM schema_migrations")).rows.map((row) => [row.name, row.checksum]));
    for (const [name, checksum] of expected) {
      if (!applied.has(name)) errors.push(`Migracion pendiente: ${name}`);
      else if (applied.get(name) !== checksum) errors.push(`Checksum distinto en migracion aplicada: ${name}`);
    }
    for (const name of applied.keys()) if (!expected.has(name)) warnings.push(`Migracion registrada pero desconocida por este codigo: ${name}`);
    if (applied.get("catalog-governance.sql") === expected.get("catalog-governance.sql")) {
      const usableCatalogItems = Number((await pool.query("SELECT count(*) FROM catalog_items WHERE active=true AND review_status='verified' AND (valid_from IS NULL OR valid_from<=CURRENT_DATE) AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)")).rows[0]?.count ?? 0);
      if (usableCatalogItems === 0) errors.push("El catalogo no contiene ninguna partida verificada y vigente");
    }
  }

  let signatures = { v1: 0, v2: 0, v3: 0, unknown: 0, v3KeyIds: [] };
  if (relations?.versions) {
    const counts = (await pool.query(`SELECT
      COUNT(*) FILTER (WHERE firma->>'token' ~ '^rp-sig-v3-[A-Za-z0-9_-]{1,32}-[a-f0-9]{32}$')::int AS v3,
      COUNT(*) FILTER (WHERE firma->>'token' ~ '^rp-sig-v2-[a-f0-9]{32}$')::int AS v2,
      COUNT(*) FILTER (WHERE firma->>'token' ~ '^rp-sig-[a-f0-9]{32}$')::int AS v1,
      COUNT(*) FILTER (WHERE firmado_at IS NOT NULL AND (firma IS NULL OR firma->>'token' IS NULL OR firma->>'token' !~ '^rp-sig-(v2-[a-f0-9]{32}|v3-[A-Za-z0-9_-]{1,32}-[a-f0-9]{32}|[a-f0-9]{32})$'))::int AS unknown
      FROM budget_versions WHERE firmado_at IS NOT NULL`)).rows[0];
    const keyRows = (await pool.query(`SELECT DISTINCT substring(firma->>'token' from '^rp-sig-v3-([A-Za-z0-9_-]{1,32})-[a-f0-9]{32}$') AS key_id
      FROM budget_versions WHERE firmado_at IS NOT NULL AND firma->>'token' ~ '^rp-sig-v3-[A-Za-z0-9_-]{1,32}-[a-f0-9]{32}$'`)).rows;
    signatures = {
      v1: Number(counts.v1), v2: Number(counts.v2), v3: Number(counts.v3), unknown: Number(counts.unknown),
      v3KeyIds: keyRows.map((row) => row.key_id).filter(Boolean),
    };
    const assessment = assessSignatureInventory(signatures, env);
    errors.push(...assessment.errors);
    warnings.push(...assessment.warnings);
  }
  return { errors, warnings, signatures };
}

export async function runProductionPreflight(env = process.env, options = {}) {
  const environment = options.databaseOnly ? { errors: [], warnings: [] } : inspectProductionEnvironment(env);
  if (!env.DATABASE_URL) return { errors: environment.errors, warnings: environment.warnings, signatures: null };
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    const database = await inspectProductionDatabase(client, env);
    return { errors: [...environment.errors, ...database.errors], warnings: [...environment.warnings, ...database.warnings], signatures: database.signatures };
  } finally {
    await client?.query("ROLLBACK").catch(() => undefined);
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseOnly = process.argv.includes("--database-only");
  const env = process.argv.includes("--legacy-v2-session-key")
    ? { ...process.env, SIGNATURE_HMAC_LEGACY_V2_USE_SESSION_KEY: "true" }
    : process.env;
  const result = await runProductionPreflight(env, { databaseOnly });
  console.log(`Firmas: ${result.signatures ? `v3=${result.signatures.v3}, v2=${result.signatures.v2}, v1=${result.signatures.v1}, desconocidas=${result.signatures.unknown}` : "no comprobadas"}`);
  for (const warning of result.warnings) console.warn(`[aviso] ${warning}`);
  for (const error of result.errors) console.error(`[bloqueo] ${error}`);
  if (result.errors.length) process.exitCode = 1;
  else console.log("Preflight de produccion correcto");
}
