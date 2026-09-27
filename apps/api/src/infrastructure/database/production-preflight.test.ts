import { describe, expect, it } from "vitest";
import { assessSignatureInventory, inspectProductionEnvironment } from "../../../scripts/preflight-production.mjs";

const validEnvironment = {
  DATABASE_URL: "postgres://example.invalid/db",
  HMAC_SECRET: "s".repeat(32),
  SIGNATURE_HMAC_SECRET: "f".repeat(32),
  SIGNATURE_HMAC_KEY_ID: "sig-2026-09",
};

describe("production preflight", () => {
  it("rejects missing, short or shared security keys without exposing their values", () => {
    const result = inspectProductionEnvironment({ DATABASE_URL: validEnvironment.DATABASE_URL, HMAC_SECRET: "shared", SIGNATURE_HMAC_SECRET: "shared", SIGNATURE_HMAC_KEY_ID: "invalid key id" });
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining("HMAC_SECRET debe tener"), expect.stringContaining("deben ser distintos"), expect.stringContaining("formato invalido")]));
    expect(result.errors.join(" ")).not.toContain("shared");
  });

  it("blocks unverifiable historical signatures", () => {
    const result = assessSignatureInventory({ v1: 1, v2: 2, v3: 3, unknown: 1, v3KeyIds: ["retired"] }, validEnvironment);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining("v1"), expect.stringContaining("v2"), expect.stringContaining("desconocido"), expect.stringContaining("retired")]));
  });

  it("accepts v2 and rotated v3 keys when their dedicated verification keys exist", () => {
    const result = assessSignatureInventory(
      { v1: 0, v2: 2, v3: 3, unknown: 0, v3KeyIds: ["sig-2026-08", "sig-2026-09"] },
      { ...validEnvironment, SIGNATURE_HMAC_LEGACY_V2_SECRET: "l".repeat(32), SIGNATURE_HMAC_PREVIOUS_KEYS: JSON.stringify({ "sig-2026-08": "p".repeat(32) }) },
    );
    expect(result.errors).toEqual([]);
  });
});
