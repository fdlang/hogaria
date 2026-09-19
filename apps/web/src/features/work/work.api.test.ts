import { describe, it, expect, vi } from "vitest";
import { WorkApi } from "./work.api";
import type { Entry } from "./work.api";
import type { ApiClient } from "@/shared/lib/api-client";
describe("WorkApi contract", () => {
  it("encodes filters without undefined values", async () => {
    const get = vi.fn().mockResolvedValue({ items: [] });
    const api = new WorkApi({ get } as unknown as ApiClient);
    await api.list({ page: 0, from: "2026-09-19T00:00:00+02:00" });
    const path = get.mock.calls[0]![0] as string;
    expect(path).toContain("page=0");
    expect(path).not.toContain("undefined");
    expect(path).toContain("%2B02%3A00");
  });
  it("always sends the displayed revision for a mutation", async () => {
    const post = vi.fn().mockResolvedValue({});
    const api = new WorkApi({ post } as unknown as ApiClient);
    await api.action({ id: "abc", revision: 7 } as Entry, {
      action: "aprobar",
      revision: 1,
    });
    expect(post).toHaveBeenCalledWith("/work/entries/abc/actions", {
      action: "aprobar",
      revision: 7,
    });
  });
});
