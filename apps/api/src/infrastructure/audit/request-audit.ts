import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

export const requestAudit = new AsyncLocalStorage<{ actorId: number; ip: string; userAgent: string }>();

/** Attach authenticated request metadata transaction-locally, never to a pooled session. */
export function auditedPool(pool: Pool): Pool {
  async function configure(client: PoolClient) {
    const context = requestAudit.getStore();
    if (!context) return;
    await client.query("SELECT set_config('hogaria.actor_id',$1,true),set_config('hogaria.ip',$2,true),set_config('hogaria.user_agent',$3,true)", [String(context.actorId),context.ip,context.userAgent.slice(0,500)]);
  }
  return new Proxy(pool, {
    get(target, key) {
      if (key === "connect") return async () => {
        const client = await target.connect();
        return new Proxy(client, {
          get(connection, property) {
            if (property === "query") return async (sql: string, args?: unknown[]) => {
              const result = await connection.query(sql, args);
              if (typeof sql === "string" && /^\s*BEGIN\s*;?\s*$/i.test(sql)) await configure(connection);
              return result;
            };
            const value = Reflect.get(connection, property);
            return typeof value === "function" ? value.bind(connection) : value;
          },
        });
      };
      if (key === "query") return async (sql: string, args?: unknown[]) => {
        if (!requestAudit.getStore() || typeof sql !== "string" || !/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) return target.query(sql,args);
        const client = await target.connect();
        try {
          await client.query("BEGIN"); await configure(client);
          const result = await client.query(sql,args);
          await client.query("COMMIT"); return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      };
      const value = Reflect.get(target,key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
