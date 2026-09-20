import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

describe("canonical schema compatibility", () => {
  it("repairs lifecycle state in a legacy users table", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE users (
          id BIGSERIAL PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          nombre TEXT NOT NULL,
          rol TEXT NOT NULL,
          profesion TEXT,
          telefono TEXT,
          activo BOOLEAN NOT NULL DEFAULT TRUE,
          session_version INTEGER NOT NULL DEFAULT 0,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE account_activation_tokens (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        INSERT INTO users(email,nombre,rol,activo,password_hash)
        VALUES
          ('active@test.invalid','Active','admin',true,'hash'),
          ('pending@test.invalid','Pending','cliente',false,'hash'),
          ('archived@test.invalid','Archived','cliente',false,'hash');
        INSERT INTO account_activation_tokens(user_id,token_hash,expires_at)
        SELECT id,'pending-token',now() + interval '1 day'
        FROM users WHERE email='pending@test.invalid';
      `);

      const schema = await readFile(
        new URL("../../../database/schema.sql", import.meta.url),
        "utf8",
      );
      await db.exec(schema);

      const result = await db.query<{ email: string; account_status: string }>(
        "SELECT email,account_status FROM users ORDER BY email",
      );
      expect(result.rows).toEqual([
        { email: "active@test.invalid", account_status: "active" },
        { email: "archived@test.invalid", account_status: "archived" },
        { email: "pending@test.invalid", account_status: "pending_activation" },
      ]);
      await db.exec(schema);
      const repeated = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM users WHERE account_status IS NULL",
      );
      expect(repeated.rows).toEqual([{ count: 0 }]);
    } finally {
      await db.close();
    }
  });
});
