import { describe, expect, it } from "vitest";
import { RequestSequence } from "./request-sequence";

describe("RequestSequence", () => {
  it("allows only the latest request to publish its result", () => {
    const sequence = new RequestSequence();
    const first = sequence.begin();
    const second = sequence.begin();

    expect(sequence.isCurrent(first)).toBe(false);
    expect(sequence.isCurrent(second)).toBe(true);
    sequence.invalidate();
    expect(sequence.isCurrent(second)).toBe(false);
  });
});
