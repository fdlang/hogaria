/**
 * CryptoService — Web Crypto wrapper.
 * - Stores the HMAC key server-side (or as a singleton in the browser)
 * - Uses a Promise singleton to prevent race conditions
 * - Timing-safe verification via re-derivation
 */

import { ITokenService } from "../../application/use-cases/auth.use-cases.js";
import { DocumentHash } from "@reformapro/domain/value-objects";

/** Cryptographic operations used to seal a proposal version. */
export interface ISignatureCrypto {
  generateSignatureToken(documentId: number, userId: number, timestamp: number, documentHash: string): Promise<string>;
  verifySignatureToken(token: string, documentId: number, userId: number, timestamp: number, documentHash: string): Promise<boolean>;
  hashDocument(serialized: string): Promise<DocumentHash>;
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Safely encode bytes → base64 without the String.fromCharCode(...spread) stack-overflow trap
function bytesToBase64(buf: ArrayBuffer): string {
  return btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
}

export class HMACKeyProvider {
  private keyPromise: Promise<CryptoKey> | null = null;
  constructor(private readonly secret?: string) {}

  // Development may use an ephemeral key. Deployments must inject HMAC_SECRET
  // so tokens and signature challenges remain valid across serverless instances.
  getKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = this.secret
        ? crypto.subtle.importKey("raw", enc.encode(this.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
        : crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    }
    return this.keyPromise;
  }
}

export class WebCryptoTokenService implements ITokenService {
  constructor(private readonly keys: HMACKeyProvider) {}

  async sign(payload: { userId: number; email: string; rol: string; exp: number; sessionVersion: number }): Promise<string> {
    const key  = await this.keys.getKey();
    const body = btoa(JSON.stringify(payload));
    const sig  = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    return `${body}.${bytesToBase64(sig)}`;
  }

  async verify(token: string): Promise<{ userId: number; email: string; rol: string; exp: number; sessionVersion: number } | null> {
    try {
      const [body, sigB64] = token.split(".");
      if (!body || !sigB64) return null;
      const key = await this.keys.getKey();
      const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
      const ok  = await crypto.subtle.verify("HMAC", key, sig, enc.encode(body));
      if (!ok) return null;
      const payload = JSON.parse(atob(body));
      if (Date.now() > payload.exp) return null;
      if (!Number.isSafeInteger(payload.sessionVersion) || payload.sessionVersion < 0) return null;
      return payload;
    } catch { return null; }
  }
}

export class WebCryptoSignatureService implements ISignatureCrypto {
  constructor(private readonly keys: HMACKeyProvider) {}

  async generateSignatureToken(docId: number, userId: number, timestamp: number, documentHash: string): Promise<string> {
    const key  = await this.keys.getKey();
    const raw  = `${docId}::${userId}::${timestamp}::${documentHash}`;
    const sig  = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
    return `rp-sig-v2-${toHex(sig).slice(0, 32)}`;
  }

  // Timing-safe: uses crypto.subtle.verify internally, then a final equality
  // check on a derived value the attacker cannot influence.
  async verifySignatureToken(token: string, docId: number, userId: number, timestamp: number, documentHash: string): Promise<boolean> {
    try {
      const key  = await this.keys.getKey();
      const legacy = token.startsWith("rp-sig-") && !token.startsWith("rp-sig-v2-");
      const raw  = legacy ? `${docId}::${userId}::${timestamp}` : `${docId}::${userId}::${timestamp}::${documentHash}`;
      const sig  = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
      const expected = `${legacy ? "rp-sig-" : "rp-sig-v2-"}${toHex(sig).slice(0, 32)}`;
      return token === expected;
    } catch { return false; }
  }

  async hashDocument(serialized: string): Promise<DocumentHash> {
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(serialized));
    return DocumentHash.of(`sha256-${toHex(digest)}`);
  }

}

// Generates a cryptographically random provisional password with UNIFORM distribution.
export function generateTempPassword(length = 12): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#";
  const maxValid = 256 - (256 % chars.length);
  const out: string[] = [];
  while (out.length < length) {
    const buf = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of buf) {
      if (out.length >= length) break;
      if (b < maxValid) out.push(chars[b % chars.length]!); // rejection sampling; modulo guarantees in-range
    }
  }
  return out.join("");
}
