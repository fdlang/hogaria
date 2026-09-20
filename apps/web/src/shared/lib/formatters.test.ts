import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatDateTime, formatMoney } from "./formatters";

describe("formatters", () => {
  it("formats money in Spanish euros and handles absent values", () => {
    expect(formatMoney(1234.5)).toMatch(/1\.234,50\s*€/);
    expect(formatMoney(4276.65)).toMatch(/4\.276,65\s*€/);
    expect(formatMoney(20365)).toMatch(/20\.365,00\s*€/);
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(Number.NaN)).toBe("—");
  });

  it("formats valid dates and protects the UI from invalid dates", () => {
    expect(formatDate("2026-09-18T12:00:00Z")).toBe("18/09/2026");
    expect(formatDateTime("not-a-date")).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats file sizes at each unit boundary", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
