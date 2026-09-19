import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { PostgresNoticeStore } from "./clientNoticeStore.js";
describe("Persistent client notification queue", () => {
  const db = new PGlite(),
    store = new PostgresNoticeStore({
      query: (sql: string, args: unknown[]) => db.query(sql, args),
    } as unknown as Pool);
  beforeAll(async () =>
    db.exec(
      await readFile(
        new URL("../../../database/client-notifications.sql", import.meta.url),
        "utf8",
      ),
    ),
  );
  afterAll(async () => db.close());
  it("deduplicates and atomically claims a pending event", async () => {
    const n = {
      id: crypto.randomUUID(),
      clientId: 1,
      resourceId: 20,
      kind: "estimate" as const,
    };
    await store.enqueue(n);
    await store.enqueue(n);
    expect(await store.claim(n.id)).toEqual(n);
    expect(await store.claim(n.id)).toBeNull();
    await store.finish(n.id, "accepted", "receipt");
    expect(await store.claim(n.id)).toBeNull();
    expect(
      (
        await db.query(
          "SELECT state,provider_id FROM client_email_notifications WHERE id=$1",
          [n.id],
        )
      ).rows,
    ).toEqual([{ state: "accepted", provider_id: "receipt" }]);
  });
  it("retains failed requests with backoff and stops after five attempts", async () => {
    const n = {
      id: crypto.randomUUID(),
      clientId: 1,
      resourceId: 20,
      kind: "estimate" as const,
    };
    await store.enqueue(n);
    for (let i = 0; i < 5; i++) {
      expect(await store.claim(n.id)).toEqual(n);
      await store.finish(n.id, "pending");
      expect(await store.claim(n.id)).toBeNull();
      await db.query(
        "UPDATE client_email_notifications SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
        [n.id],
      );
    }
    expect(await store.claim(n.id)).toBeNull();
    expect(
      (
        await db.query(
          "SELECT state FROM client_email_notifications WHERE id=$1",
          [n.id],
        )
      ).rows,
    ).toEqual([{ state: "failed" }]);
  });
});
