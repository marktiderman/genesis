/**
 * Relative times: one wording (`relativeTime`, in utils), opted into everywhere it shows.
 * - `relativeTime` itself: minutes in Genesis's words, hours and days from Intl, a date past a week;
 * - `formatRelativeTime` and `DateCell` keep date-fns' wording unless `style`/`relative` is "short";
 * - `relativeDatetimeRenderer` is the `datetime` renderer only under a DisplayRenderersProvider.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateCell } from "../components/data/cell-formatters";
import { RelativeTime, relativeDatetimeRenderer, relativeTime, webDisplayRenderers } from "../components/data/resource-view";
import { formatRelativeTime } from "../utils";

const NOW = new Date("2026-06-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const UTC = { timeZone: "UTC" };

describe("relativeTime", () => {
  it("says seconds as just now, and minutes in Genesis's words, both ways", () => {
    expect(relativeTime(ago(20_000), NOW, UTC)).toBe("just now");
    expect(relativeTime(ago(3 * MIN), NOW, UTC)).toBe("3 min ago");
    expect(relativeTime(ago(-5 * MIN), NOW, UTC)).toBe("in 5 min");
  });

  it("says hours on the same day, and days on the viewer's calendar", () => {
    expect(relativeTime(ago(2 * HOUR), NOW, UTC)).toMatch(/2 hours ago/);
    expect(relativeTime(ago(DAY), NOW, UTC)).toBe("yesterday");
    expect(relativeTime(ago(-DAY), NOW, UTC)).toBe("tomorrow");
    expect(relativeTime(ago(4 * DAY), NOW, UTC)).toBe("4 days ago");
    // 11pm UTC yesterday is still today in Tokyo.
    expect(relativeTime(new Date("2026-06-14T23:00:00Z"), NOW, { timeZone: "Asia/Tokyo" })).toMatch(/hours ago/);
  });

  it("says the date past a week, with the year when it isn't this one", () => {
    expect(relativeTime(new Date("2026-05-01T12:00:00Z"), NOW, UTC)).toBe("May 1");
    expect(relativeTime(new Date("2025-05-01T12:00:00Z"), NOW, UTC)).toBe("May 1, 2025");
  });

  it("takes translated words, reads an unknown zone on the device's clock, and passes a non-date through", () => {
    expect(relativeTime(ago(3 * MIN), NOW, { words: { justNow: "now", minutesAgo: "{n}m", inMinutes: "+{n}m" } })).toBe("3m");
    expect(relativeTime(ago(3 * MIN), NOW, { timeZone: "Not/AZone" })).toBe("3 min ago");
    expect(relativeTime("not a date", NOW)).toBe("not a date");
  });
});

describe("formatRelativeTime and DateCell", () => {
  it("keep date-fns' wording by default", () => {
    const twoHours = new Date(Date.now() - 2 * HOUR);
    expect(formatRelativeTime(twoHours)).toBe("about 2 hours ago");
    expect(DateCell()(null, twoHours.toISOString())).toBe("about 2 hours ago");
  });

  it('use relativeTime\'s wording when asked for "short"', () => {
    const threeMin = new Date(Date.now() - 3 * MIN);
    expect(formatRelativeTime(threeMin, { style: "short" })).toBe("3 min ago");
    expect(DateCell({ relative: "short" })(null, threeMin.toISOString())).toBe("3 min ago");
  });
});

describe("relativeDatetimeRenderer", () => {
  it("is opt-in: the default datetime renderer is unchanged", () => {
    expect(webDisplayRenderers.datetime).not.toBe(relativeDatetimeRenderer);
  });

  it("draws a <time> with the relative words and the exact time on hover", () => {
    const at = new Date(Date.now() - 3 * MIN);
    render(<RelativeTime value={at.toISOString()} timeZone="UTC" />);
    const el = screen.getByText("3 min ago");
    expect(el.tagName).toBe("TIME");
    expect(el.getAttribute("dateTime")).toBe(at.toISOString());
    expect(el.getAttribute("title")).toBeTruthy();
  });
});
