/**
 * ResourceView's calendar mode, the next three gaps a consumer app found building a team calendar:
 * - `weeksOptions`: a weeks switch beside `layouts`, its pick kept where the layout's is, and a
 *   `toolbar` slot beside both;
 * - all-day rows: days drawn as they are, and instants at UTC midnight read on UTC (the day they
 *   name, on a clock behind UTC as well as ahead of it);
 * - `laneColor(i)`: a distinct colour for every lane, and EventCalendar's opt-in `colorLanes`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { EventCalendar, laneColor } from "../calendar";
import { ResourceView } from "../resource-view";

type Shift = { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; day: string | null; last_day: string | null };

const shifts = defineResource<Shift>()({
  name: "shifts",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "starts_at", type: "datetime", dbType: "timestamp with time zone" },
    { name: "ends_at", type: "datetime", dbType: "timestamp with time zone", nullable: true },
    { name: "all_day", type: "boolean" },
    { name: "day", type: "datetime", dbType: "date", nullable: true },
    { name: "last_day", type: "datetime", dbType: "date", nullable: true },
  ],
});

function provider(rows: readonly Partial<Shift>[]): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: rows, total: rows.length })),
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

const days = async (name: RegExp) => (await screen.findAllByRole("button", { name })).map((b) => b.closest("[data-day]")!.getAttribute("data-day"));

describe("calendar mode: the weeks switch and the toolbar slot", () => {
  const view = defineView(shifts, { calendar: { field: "starts_at", layout: "weeks", weeks: 2, weekStartsOn: 1 } });
  const rows = [{ id: "a", title: "Open", starts_at: "2026-11-04T17:00:00Z", all_day: false }];
  const base = { anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: "UTC" } as const;

  it("offers the week counts and keeps the pick, as the layout switch does", async () => {
    render(<ResourceView view={view} mode="calendar" calendar={{ ...base, weeksOptions: [1, 2, 4] }} />, { wrapper: wrap(provider(rows)) });
    await screen.findAllByText("Open");
    expect(screen.getByRole("group", { name: "Weeks shown" })).toBeTruthy();
    expect(screen.getByTestId("resource-calendar-weeks-2").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll("[data-day]")).toHaveLength(14);
    fireEvent.click(screen.getByTestId("resource-calendar-weeks-4"));
    await waitFor(() => expect(document.querySelectorAll("[data-day]")).toHaveLength(28));
    expect(screen.getByTestId("resource-calendar-weeks-4").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 week")).toBeTruthy();
  });

  it("hands the pick to the screen with onWeeksChange", async () => {
    const onWeeksChange = vi.fn();
    render(<ResourceView view={view} mode="calendar" calendar={{ ...base, weeks: 1, weeksOptions: [1, 2], onWeeksChange }} />, { wrapper: wrap(provider(rows)) });
    await screen.findAllByText("Open");
    expect(document.querySelectorAll("[data-day]")).toHaveLength(7);
    fireEvent.click(screen.getByTestId("resource-calendar-weeks-2"));
    expect(onWeeksChange).toHaveBeenCalledWith(2);
    // Controlled: nothing moves until the screen passes the new weeks.
    expect(document.querySelectorAll("[data-day]")).toHaveLength(7);
  });

  it("shows no switch for one option, or on a month", async () => {
    const month = defineView(shifts, { calendar: { field: "starts_at", layout: "month" } });
    const { unmount } = render(<ResourceView view={view} mode="calendar" calendar={{ ...base, weeksOptions: [2] }} />, { wrapper: wrap(provider(rows)) });
    await screen.findAllByText("Open");
    expect(screen.queryByRole("group", { name: "Weeks shown" })).toBeNull();
    unmount();
    render(<ResourceView view={month} mode="calendar" calendar={{ ...base, weeksOptions: [1, 2] }} />, { wrapper: wrap(provider(rows)) });
    await screen.findAllByText("Open");
    expect(screen.queryByRole("group", { name: "Weeks shown" })).toBeNull();
  });

  it("refuses a week count that isn't 1 to 4", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<ResourceView view={view} mode="calendar" calendar={{ ...base, weeksOptions: [1, 6 as 1] }} />, { wrapper: wrap(provider(rows)) }),
    ).toThrow(/weeksOptions are 1 to 4, not 6/);
  });

  it("puts the screen's toolbar beside the switches, and tells a function what's shown", async () => {
    render(
      <ResourceView
        view={view}
        mode="calendar"
        calendar={{
          ...base,
          layouts: ["weeks", "agenda"],
          toolbar: ({ layout, weeks, anchor }) => <button type="button">{`Print ${layout} ${weeks} ${anchor}`}</button>,
        }}
      />,
      { wrapper: wrap(provider(rows)) },
    );
    expect(await screen.findByRole("button", { name: "Print weeks 2 2026-11-04" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("resource-calendar-layout-agenda"));
    expect(await screen.findByRole("button", { name: "Print agenda 2 2026-11-04" })).toBeTruthy();
  });

  it("takes a plain node too", async () => {
    render(<ResourceView view={view} mode="calendar" calendar={{ ...base, toolbar: <span>Team</span> }} />, { wrapper: wrap(provider(rows)) });
    expect(await screen.findByText("Team")).toBeTruthy();
  });
});

describe("calendar mode: all-day rows", () => {
  // Ten hours behind UTC and thirteen ahead: the two ends a noon-UTC workaround can't cover.
  const ZONES = ["Pacific/Honolulu", "Pacific/Tongatapu"];

  for (const zone of ZONES) {
    const base = { anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: zone } as const;

    it(`draws an instant at UTC midnight on its UTC day in ${zone}`, async () => {
      const view = defineView(shifts, { calendar: { field: "starts_at", endField: "ends_at", allDayField: "all_day", layout: "weeks", weeks: 2, weekStartsOn: 1 } });
      const rows = [
        // Google's shape, as stored: the 5th and the 6th, the end exclusive.
        { id: "a", title: "Leave", starts_at: "2026-11-05T00:00:00+00:00", ends_at: "2026-11-07T00:00:00+00:00", all_day: true },
        { id: "b", title: "Holiday", starts_at: "2026-11-09T00:00:00Z", ends_at: null, all_day: true },
      ];
      render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider(rows)) });
      expect(await days(/Leave/)).toEqual(["2026-11-05", "2026-11-06"]);
      expect(await days(/Holiday/)).toEqual(["2026-11-09"]);
    });

    it(`draws days as they are, with no clock, in ${zone}`, async () => {
      const view = defineView(shifts, { calendar: { field: "day", endField: "last_day", allDayField: "all_day", layout: "weeks", weeks: 2, weekStartsOn: 1 } });
      const rows = [{ id: "a", title: "Leave", day: "2026-11-05", last_day: "2026-11-06", all_day: true }];
      render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider(rows)) });
      expect(await days(/Leave/)).toEqual(["2026-11-05", "2026-11-06"]);
    });

    it(`keeps an all-day row stored as the viewer's midnights on the viewer's clock in ${zone}`, async () => {
      const view = defineView(shifts, { calendar: { field: "starts_at", endField: "ends_at", allDayField: "all_day", layout: "weeks", weeks: 2, weekStartsOn: 1 } });
      const midnight = zone === "Pacific/Honolulu" ? ["2026-11-05T10:00:00Z", "2026-11-06T10:00:00Z"] : ["2026-11-04T11:00:00Z", "2026-11-05T11:00:00Z"];
      const rows = [{ id: "a", title: "Leave", starts_at: midnight[0], ends_at: midnight[1], all_day: true }];
      render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider(rows)) });
      expect(await days(/Leave/)).toEqual(["2026-11-05"]);
    });

    it(`keeps a timed row on the viewer's clock in ${zone}`, async () => {
      const view = defineView(shifts, { calendar: { field: "starts_at", allDayField: "all_day", layout: "weeks", weeks: 2, weekStartsOn: 1 } });
      // 1am UTC on the 5th: the 4th in Honolulu, the 5th in Tonga.
      const rows = [{ id: "a", title: "Call", starts_at: "2026-11-05T01:00:00Z", all_day: false }];
      render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider(rows)) });
      expect(await days(/Call/)).toEqual([zone === "Pacific/Honolulu" ? "2026-11-04" : "2026-11-05"]);
    });

    it(`asks for a day more each side, so a UTC-midnight row on the window's edge loads, in ${zone}`, async () => {
      const view = defineView(shifts, { calendar: { field: "starts_at", allDayField: "all_day", layout: "weeks", weeks: 1, weekStartsOn: 1 } });
      const p = provider([]);
      render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(p) });
      await waitFor(() => expect(p.getList).toHaveBeenCalled());
      const params = vi.mocked(p.getList).mock.calls[0]![1] as ListParams;
      const bound = (op: string) => String((params.filters!.find((f) => "operator" in f && f.operator === op && f.field === "starts_at") as { value: unknown }).value);
      // The week of Mon 2 Nov: from before the 2nd's UTC midnight to after the 9th's.
      expect(Date.parse(bound("gte"))).toBeLessThanOrEqual(Date.parse("2026-11-02T00:00:00Z"));
      expect(Date.parse(bound("lt"))).toBeGreaterThan(Date.parse("2026-11-08T00:00:00Z"));
    });
  }

  it("draws genesis-calendar's toCalendarEvent output (days, inclusive last day) as it is", () => {
    // toCalendarEvent's shape for an all-day event on the 5th and 6th (Google's end, the 7th, made the last day).
    const event = { key: "leave|2026-11-05", title: "Leave", start: "2026-11-05", end: "2026-11-06", allDay: true, lanes: ["ann"] };
    for (const zone of ["Pacific/Honolulu", "Pacific/Tongatapu"]) {
      const { unmount } = render(<EventCalendar events={[event]} layout="weeks" weeks={1} anchor="2026-11-04" timeZone={zone} onSelect={() => {}} />);
      const shown = screen.getAllByRole("button", { name: /Leave/ }).map((b) => b.closest("[data-day]")!.getAttribute("data-day"));
      expect(shown).toEqual(["2026-11-05", "2026-11-06"]);
      unmount();
    }
  });
});

describe("laneColor", () => {
  it("starts with the five chart tokens", () => {
    expect([0, 1, 2, 3, 4].map(laneColor)).toEqual([1, 2, 3, 4, 5].map((n) => `hsl(var(--chart-${n}))`));
  });

  it("gives every index its own colour, the same each time", () => {
    const colours = Array.from({ length: 2000 }, (_, i) => laneColor(i));
    expect(new Set(colours).size).toBe(2000);
    expect(laneColor(37)).toBe(laneColor(37));
  });

  it("makes the rest from the theme, deepened toward the foreground so they keep contrast", () => {
    expect(laneColor(5)).toBe("color-mix(in oklch, hsl(var(--chart-1)), hsl(var(--foreground)) 35%)");
    expect(laneColor(10)).toBe("color-mix(in oklch, hsl(var(--chart-1)) 60%, hsl(var(--chart-2)))");
    for (let i = 5; i < 200; i++) expect(laneColor(i)).toMatch(/^color-mix\(in oklch, .*var\(--chart-\d\).*\)$/);
  });

  it("reads a bad index as the first", () => {
    expect(laneColor(-3)).toBe(laneColor(0));
    expect(laneColor(Number.NaN)).toBe(laneColor(0));
    expect(laneColor(2.7)).toBe(laneColor(2));
  });

  it("colours EventCalendar's lanes with no colour of their own, when asked", () => {
    const lanes = Array.from({ length: 7 }, (_, i) => ({ key: `p${i}`, label: `Person ${i}`, ...(i === 1 ? { color: "red" } : {}) }));
    const events = lanes.map((l) => ({ key: l.key, title: `Shift ${l.key}`, start: "2026-11-04", lanes: [l.key] }));
    const dot = (key: string) => (screen.getByText(`Shift ${key}`).closest("[data-testid='event-calendar-item']")!.querySelector("span[title]") as HTMLElement | null)?.style.backgroundColor;
    const { unmount } = render(<EventCalendar events={events} lanes={lanes} layout="agenda" weeks={1} anchor="2026-11-04" timeZone="UTC" />);
    // Off by default: only the lane with its own colour has a dot.
    expect(dot("p0")).toBeUndefined();
    expect(dot("p1")).toBe("red");
    unmount();
    render(<EventCalendar events={events} lanes={lanes} colorLanes layout="agenda" weeks={1} anchor="2026-11-04" timeZone="UTC" />);
    // Every lane has a dot now. (jsdom drops color-mix() from a style, so only the plain ones are read.)
    const dots = lanes.map((l) => screen.getByText(`Shift ${l.key}`).closest("[data-testid='event-calendar-item']")!.querySelector("span[title]"));
    expect(dots.every(Boolean)).toBe(true);
    expect(dots[1]!.getAttribute("style")).toContain("red");
    expect(dots[0]!.getAttribute("style")).toContain("--chart-1");
    // By place in the lanes: the third lane is the third chart colour.
    expect(dots[2]!.getAttribute("style")).toContain("--chart-3");
  });
});
