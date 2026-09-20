import { describe, expect, it, vi } from "vitest";
import { ExclusiveAction } from "./exclusive-action";

describe("ExclusiveAction", () => {
  it("ignores a second project mutation until the first one settles", async () => {
    let finish!: () => void;
    const first = new Promise<void>(resolve => { finish = resolve; });
    const action = new ExclusiveAction();
    const work = vi.fn(() => first);
    const pending = action.run(work);

    await expect(action.run(work)).resolves.toBe(false);
    expect(work).toHaveBeenCalledOnce();
    finish();
    await expect(pending).resolves.toBe(true);
  });
});
