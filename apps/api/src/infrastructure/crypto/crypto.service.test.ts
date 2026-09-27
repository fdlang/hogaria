import { describe, expect, it } from "vitest";
import { HMACKeyProvider, WebCryptoSignatureService } from "./crypto.service.js";

const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value)).map(byte => byte.toString(16).padStart(2, "0")).join("");

describe("WebCryptoSignatureService", () => {
  it("rejects unbound legacy seals and issues hash-bound seals with a key id", async () => {
    const legacySecret = "legacy-secret-with-enough-entropy";
    const active = new HMACKeyProvider("signature-secret-with-enough-entropy");
    const legacyKeys = new HMACKeyProvider(legacySecret);
    const service = new WebCryptoSignatureService(active, "sig-2026", new Map(), legacyKeys);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(legacySecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const legacySignature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("7::9::123"));
    const legacy = `rp-sig-${hex(legacySignature).slice(0, 32)}`;

    await expect(service.verifySignatureToken(legacy, 7, 9, 123, "sha256-old")).resolves.toBe(false);
    const current = await service.generateSignatureToken(7, 9, 123, "sha256-current");
    expect(current).toMatch(/^rp-sig-v3-sig-2026-/);
    await expect(service.verifySignatureToken(current, 7, 9, 123, "sha256-current")).resolves.toBe(true);
    await expect(service.verifySignatureToken(current, 7, 9, 123, "sha256-tampered")).resolves.toBe(false);
  });

  it("keeps v2 and previous v3 verification keys without using them for new seals", async () => {
    const old = new HMACKeyProvider("old-signature-secret-with-enough-entropy");
    const current = new HMACKeyProvider("new-signature-secret-with-enough-entropy");
    const service = new WebCryptoSignatureService(current, "new", new Map([["old", old]]), old);
    const raw = "7::9::123::sha256-current";
    const oldSignature = await crypto.subtle.sign("HMAC", await old.getKey(), new TextEncoder().encode(raw));
    await expect(service.verifySignatureToken(`rp-sig-v2-${hex(oldSignature).slice(0, 32)}`, 7, 9, 123, "sha256-current")).resolves.toBe(true);
    await expect(service.verifySignatureToken(`rp-sig-v3-old-${hex(oldSignature).slice(0, 32)}`, 7, 9, 123, "sha256-current")).resolves.toBe(true);
  });

  it("rejects v2 seals when no dedicated legacy verification key is configured", async () => {
    const current = new HMACKeyProvider("new-signature-secret-with-enough-entropy");
    const service = new WebCryptoSignatureService(current, "new");
    await expect(service.verifySignatureToken("rp-sig-v2-00000000000000000000000000000000", 7, 9, 123, "sha256-current"))
      .resolves.toBe(false);
  });
});
