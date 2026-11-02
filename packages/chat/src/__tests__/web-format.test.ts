/**
 * The inbox's time is Genesis UI's relativeTime in its compact style, with the words and shapes
 * the inbox always had: "now", "5m", the clock time today, "Yesterday", the weekday, the date.
 */
import { describe, expect, it } from "vitest";
import { relativeTime } from "../web/format";

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const NOW = local(2026, 6, 17, 15, 0); // a Wednesday

describe("relativeTime (inbox)", () => {
  it("says nothing for no time, now under a minute, and minutes under an hour", () => {
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime(local(2026, 6, 17, 14, 59, ).toISOString(), NOW, "en-US")).toBe("1m");
    expect(relativeTime(new Date(NOW.getTime() - 20_000).toISOString(), NOW, "en-US")).toBe("now");
    expect(relativeTime(local(2026, 6, 17, 14, 5).toISOString(), NOW, "en-US")).toBe("55m");
  });

  it("says the clock time today, Yesterday, the weekday this week and the date after", () => {
    expect(relativeTime(local(2026, 6, 17, 9, 30).toISOString(), NOW, "en-US")).toBe(
      local(2026, 6, 17, 9, 30).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    );
    expect(relativeTime(local(2026, 6, 16, 9, 30).toISOString(), NOW, "en-US")).toBe("Yesterday");
    expect(relativeTime(local(2026, 6, 14, 9, 30).toISOString(), NOW, "en-US")).toBe("Sun");
    expect(relativeTime(local(2026, 3, 12, 9, 30).toISOString(), NOW, "en-GB")).toBe("12 Mar");
    expect(relativeTime(local(2025, 3, 12, 9, 30).toISOString(), NOW, "en-GB")).toBe("12 Mar 2025");
  });
});
