import { describe, it, expect } from "vitest";
import { interval, localDate } from "./work-ui";
describe("work correction time precision", () => {
  it("keeps original instants and pauses when only notes change", () => {
    const original = {
      startedAt: "2026-10-25T01:30:41.123Z",
      endedAt: "2026-10-25T02:45:12.234Z",
    };
    const data = new FormData();
    data.set("startedAt", localDate(original.startedAt));
    data.set("endedAt", localDate(original.endedAt));
    data.set("breakSeconds", "31.456");
    data.set("notes", "Corrección de notas");
    expect(interval(data, original)).toMatchObject({
      ...original,
      breakSeconds: 31.456,
      notes: "Corrección de notas",
    });
  });
  it("converts local input to a zoned instant for new parts", () => {
    const data = new FormData();
    data.set("startedAt", "2026-09-19T08:00");
    data.set("endedAt", "2026-09-19T09:00");
    data.set("breakMinutes", "15");
    expect(interval(data)).toMatchObject({
      startedAt: new Date("2026-09-19T08:00").toISOString(),
      breakMinutes: 15,
    });
  });
});
