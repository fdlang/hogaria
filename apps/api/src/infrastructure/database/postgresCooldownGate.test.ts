import { describe, expect, it, vi } from "vitest";
import { PostgresCooldownGate } from "./postgresCooldownGate.js";

describe("PostgresCooldownGate", () => {
  it("stores a pseudonymous key and purges expired windows", async () => {
    const query = vi.fn(async (sql: string) => ({ rowCount: sql.startsWith("DELETE") ? 0 : 1 }));
    const gate = new PostgresCooldownGate({ query } as never);

    await expect(gate.check("login:203.0.113.4:person@example.test", 2, 60_000)).resolves.toBe(true);

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toContain("DELETE FROM rate_limit_windows");
    const storedKey = String(query.mock.calls[1]?.[1]?.[0]);
    expect(storedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(storedKey).not.toContain("person@example.test");
    expect(storedKey).not.toContain("203.0.113.4");
  });
});
