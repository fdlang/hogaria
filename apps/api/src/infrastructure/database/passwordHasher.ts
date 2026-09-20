/**
 * Password hashing.
 *
 * Production uses bcrypt (or argon2id for new deploys). The Hasher port lets us
 * swap the algorithm without touching domain or use-cases — important because
 * best-practice changes over time.
 *
 * bcrypt cost of 12 ≈ 250ms on modern hardware. Adjust upward every 2 years.
 */

import type { PasswordHasher } from "./inMemoryRepositories.js";

// We avoid importing bcrypt at module top-level so this file works in Node and browser.
// Production backend wires this up with bcryptjs/bcrypt at bootstrap.
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly bcrypt: { hash(pwd: string, cost: number): Promise<string>; compare(pwd: string, hash: string): Promise<boolean> }, private readonly cost = 12) {}
  hash(plaintext: string): Promise<string>                     { return this.bcrypt.hash(plaintext, this.cost); }
  verify(plaintext: string, hash: string): Promise<boolean>   { return this.bcrypt.compare(plaintext, hash); }
}
