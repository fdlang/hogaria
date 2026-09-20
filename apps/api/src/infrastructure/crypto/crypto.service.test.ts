import { describe, expect, it } from "vitest";
import { HMACKeyProvider, WebCryptoSignatureService } from "./crypto.service.js";

const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value)).map(byte => byte.toString(16).padStart(2, "0")).join("");

describe("WebCryptoSignatureService", () => {
  it("verifies legacy seals while issuing versioned seals bound to the document hash", async () => {
    const secret = "test-secret-with-enough-entropy";
    const service = new WebCryptoSignatureService(new HMACKeyProvider(secret));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const legacySignature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("7::9::123"));
    const legacy = `rp-sig-${hex(legacySignature).slice(0, 32)}`;

    await expect(service.verifySignatureToken(legacy, 7, 9, 123, "sha256-old")).resolves.toBe(true);
    const current = await service.generateSignatureToken(7, 9, 123, "sha256-current");
    expect(current).toMatch(/^rp-sig-v2-/);
    await expect(service.verifySignatureToken(current, 7, 9, 123, "sha256-current")).resolves.toBe(true);
    await expect(service.verifySignatureToken(current, 7, 9, 123, "sha256-tampered")).resolves.toBe(false);
  });
});
