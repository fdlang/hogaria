import { describe, expect, it } from "vitest";
import { canTransitionInvoice, canTransitionPayment } from "./billing.js";

describe("billing state governance", () => {
  it("keeps issued and paid invoices immutable", () => {
    expect(canTransitionInvoice("draft", "issued")).toBe(true);
    expect(canTransitionInvoice("issued", "draft")).toBe(false);
    expect(canTransitionInvoice("paid", "issued")).toBe(false);
  });

  it("requires an explicit reconciliation path for payments", () => {
    expect(canTransitionPayment("pending", "received")).toBe(true);
    expect(canTransitionPayment("received", "reconciled")).toBe(true);
    expect(canTransitionPayment("pending", "reconciled")).toBe(false);
  });
});
