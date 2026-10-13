const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertLocalDatabaseTarget(connectionString, environment = process.env) {
  if (environment.NODE_ENV === "production" || environment.VERCEL) {
    throw new Error("Reset bloqueado: no se permite en un entorno de produccion o Vercel");
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("Reset bloqueado: DATABASE_URL no es una URL valida");
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname)) {
    throw new Error("Reset bloqueado: DATABASE_URL debe apuntar a PostgreSQL local");
  }
}
