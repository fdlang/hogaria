import { describe, expect, it } from "vitest";
import { parsePagination, wantsPagination } from "./pagination.js";

describe("HTTP pagination", () => {
  it("uses bounded defaults", () => expect(parsePagination({ page: "2" })).toEqual({ page: 2, limit: 20 }));
  it.each([{ page: "0" }, { page: "1.5" }, { limit: "0" }, { limit: "101" }, { limit: "x" }])("rejects invalid values: %o", query => {
    expect(() => parsePagination(query)).toThrow();
  });
  it("keeps legacy list calls distinguishable", () => {
    expect(wantsPagination({})).toBe(false);
    expect(wantsPagination({ page: "1" })).toBe(true);
  });
});
