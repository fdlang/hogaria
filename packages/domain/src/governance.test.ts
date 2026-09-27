import { describe, expect, it } from "vitest";
import { requiresIndependentApproval } from "./governance.js";

describe("segregation of duties", () => {
  it("requires another administrator when more than one is available", () => {
    expect(requiresIndependentApproval({ activeAdministrators: 2, independentApprovalRequired: false, actorId: 7, originators: [7] })).toBe(true);
    expect(requiresIndependentApproval({ activeAdministrators: 2, independentApprovalRequired: false, actorId: 8, originators: [7] })).toBe(false);
    expect(requiresIndependentApproval({ activeAdministrators: 1, independentApprovalRequired: false, actorId: 7, originators: [7] })).toBe(false);
  });

  it("does not lose the four-eyes requirement when administrators are later deactivated", () => {
    expect(requiresIndependentApproval({ activeAdministrators: 1, independentApprovalRequired: true, actorId: 7, originators: [7] })).toBe(true);
    expect(requiresIndependentApproval({ activeAdministrators: 1, independentApprovalRequired: true, actorId: 8, originators: [7] })).toBe(false);
  });

  it("fails closed when the author of a controlled historical operation is unknown", () => {
    expect(requiresIndependentApproval({ activeAdministrators: 2, independentApprovalRequired: false, actorId: 8, originators: [undefined] })).toBe(true);
    expect(requiresIndependentApproval({ activeAdministrators: 1, independentApprovalRequired: false, actorId: 8, originators: [undefined] })).toBe(true);
  });
});
