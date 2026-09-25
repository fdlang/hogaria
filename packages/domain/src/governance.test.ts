import { describe, expect, it } from "vitest";
import { requiresIndependentApproval } from "./governance.js";

describe("segregation of duties", () => {
  it("requires another administrator when more than one is available", () => {
    expect(requiresIndependentApproval({ activeAdministrators: 2, actorId: 7, originators: [7] })).toBe(true);
    expect(requiresIndependentApproval({ activeAdministrators: 2, actorId: 8, originators: [7] })).toBe(false);
    expect(requiresIndependentApproval({ activeAdministrators: 1, actorId: 7, originators: [7] })).toBe(false);
  });
});
