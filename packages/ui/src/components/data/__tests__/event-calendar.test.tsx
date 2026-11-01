// @feat:resource-view-calendar
/**
 * The calendar ResourceView's calendar mode draws with.
 * - placement: an event on every day it covers, all-day first, timed by start, clipped to the window;
 * - the window: a month's whole weeks, or 1–4 weeks from Sunday or Monday;
 * - layouts: month, weeks, agenda (prints as a list) and lanes (one row per person);
 * - dots: an event's colours or its lanes', its lanes named for screen readers;
 * - keyboard: arrow keys between days, Enter on an event selects it;
 * - ResourceView mode="calendar": one request per window, scope and filters kept, a click opens the peek.
 */
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, useResource, ViewerScope, type DataProvider, type FilterParam } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import {
  calendarLanes,
  calendarWindow,
  EventCalendar,
  eventDays,
  eventDots,
  placeEvents,
  readEventTime,
  shiftAnchor,
  timeStorage,
  windowBounds,
  type CalendarEvent,
} from "../calendar";
import { ResourceView, useResourceView } from "../resource-view";

const Z = "America/Denver";
const at = (iso: string) => new Date(iso);

describe("calendarWindow", () => {
  it("covers a month in whole weeks, Sunday or Monday first", () => {
    expect(calendarWindow("month", "2026-11-15", { weekStartsOn: 0 })).toEqual({ start: "2026-11-01", end: "2026-12-06" });
    expect(calendarWindow("month", "2026-11-15")).toEqual({ start: "2026-10-26", end: "2026-12-07" });
  });

  it("shows 1 to 4 weeks from the anchor's week, 2 by default", () => {
    expect(calendarWindow("weeks", "2026-11-04", { weekStartsOn: 0 })).toEqual({ start: "2026-11-01", end: "2026-11-15" });
    expect(calendarWindow("agenda", "2026-11-04", { weeks: 1, weekStartsOn: 0 })).toEqual({ start: "2026-11-01", end: "2026-11-08" });
    expect(calendarWindow("lanes", "2026-11-04", { weeks: 4 }).end).toBe("2026-11-30");
  });

  it("steps by a month or by the window's weeks", () => {
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftAnchor("weeks", "2026-11-04", -1, 2)).toBe("2026-10-21");
  });
});

describe("placeEvents", () => {
  const range = { start: "2026-11-01", end: "2026-11-08" };

  it("puts an all-day event on every day it covers, its end inclusive", () => {
    const trip: CalendarEvent = { key: "trip", title: "Trip", start: "2026-10-30", end: "2026-11-02" };
    const placed = placeEvents([trip], range, Z);
    expect(placed.get("2026-11-01")!.map((p) => [p.continued, p.continues])).toEqual([[true, true]]);
    expect(placed.get("2026-11-02")!.map((p) => [p.continued, p.continues])).toEqual([[true, false]]);
    expect(placed.get("2026-11-03")).toEqual([]);
  });

  it("places a timed event on its days on the zone's clock, its end exclusive", () => {
    // 22:00 to 02:00 in Denver: Monday night into Tuesday.
    const late: CalendarEvent = { key: "late", title: "Late", start: at("2026-11-03T05:00:00Z"), end: at("2026-11-03T09:00:00Z") };
    expect(eventDays(late, Z)).toEqual({ first: "2026-11-02", last: "2026-11-03" });
    // To midnight: only the one day.
    const toMidnight: CalendarEvent = { key: "m", title: "M", start: at("2026-11-03T05:00:00Z"), end: at("2026-11-03T07:00:00Z") };
    expect(eventDays(toMidnight, Z)).toEqual({ first: "2026-11-02", last: "2026-11-02" });
    // In UTC it's all on the 3rd.
    expect(eventDays(late, "UTC")).toEqual({ first: "2026-11-03", last: "2026-11-03" });
  });

  it("sorts all-day events first, then timed ones by start, then by title", () => {
    const events: CalendarEvent[] = [
      { key: "b", title: "Breakfast", start: at("2026-11-02T15:00:00Z") },
      { key: "a", title: "Appointment", start: at("2026-11-02T14:00:00Z") },
      { key: "h", title: "Holiday", start: "2026-11-02" },
      { key: "z", title: "Zoo week", start: "2026-11-01", end: "2026-11-04" },
    ];
    expect(placeEvents(events, range, Z).get("2026-11-02")!.map((p) => p.event.key)).toEqual(["h", "z", "a", "b"]);
  });

  it("leaves out events outside the window", () => {
    const placed = placeEvents([{ key: "x", title: "X", start: "2026-12-01" }], range, Z);
    expect([...placed.values()].flat()).toEqual([]);
  });
});

describe("lanes and dots", () => {
  const people = [
    { key: "ana", label: "Ana", color: "var(--chart-1)" },
    { key: "ben", label: "Ben", color: "var(--chart-2)" },
  ];

  it("keeps the given lanes in order and adds ones only an event names", () => {
    expect(calendarLanes([{ key: "e", title: "E", start: "2026-11-01", lanes: ["cy", "ana"] }], people).map((l) => l.key)).toEqual(["ana", "ben", "cy"]);
  });

  it("dots an event with its colours, else its lanes'", () => {
    expect(eventDots({ key: "e", title: "E", start: "2026-11-01", lanes: ["ben", "ana"] }, people)).toEqual([
      { color: "var(--chart-2)", label: "Ben" },
      { color: "var(--chart-1)", label: "Ana" },
    ]);
    expect(eventDots({ key: "e", title: "E", start: "2026-11-01", lanes: ["ana"], colors: ["red"] }, people)).toEqual([{ color: "red" }]);
  });
});

describe("timeStorage and windowBounds", () => {
  it("tells dates, instants and wall times apart", () => {
    expect(timeStorage({ dbType: "date" })).toBe("date");
    expect(timeStorage({ dbType: "timestamp with time zone" })).toBe("zoned");
    expect(timeStorage({})).toBe("zoned");
    expect(timeStorage({ dbType: "timestamp without time zone" })).toBe("wall");
  });

  it("bounds a window by days, by the zone's midnights, or by wall-clock midnights", () => {
    const range = { start: "2026-11-01", end: "2026-11-08" };
    expect(windowBounds(range, "date", Z, 3)).toEqual({ from: "2026-10-29", to: "2026-11-08" });
    expect(windowBounds(range, "zoned", Z)).toEqual({ from: "2026-11-01T06:00:00.000Z", to: "2026-11-08T07:00:00.000Z" });
    expect(windowBounds(range, "wall", Z)).toEqual({ from: "2026-11-01T00:00:00", to: "2026-11-08T00:00:00" });
  });

  it("re-exports core's readEventTime", () => {
    expect(readEventTime("2026-11-02 09:30:00", { timeZone: Z })).toEqual(new Date("2026-11-02T16:30:00Z"));
  });
});

const family: CalendarEvent[] = [
  { key: "dinner", title: "Dinner out", start: at("2026-11-03T01:30:00Z"), end: at("2026-11-03T03:00:00Z"), lanes: ["ana", "ben"] },
  { key: "camp", title: "Camp", start: "2026-11-05", end: "2026-11-07", lanes: ["ben"] },
  { key: "dentist", title: "Dentist", start: at("2026-11-04T16:00:00Z"), lanes: ["ana"] },
];
const people = [
  { key: "ana", label: "Ana", color: "var(--chart-1)" },
  { key: "ben", label: "Ben", color: "var(--chart-2)" },
];

describe("EventCalendar", () => {
  it("draws each event once, with a dot per lane and the lanes named", () => {
    render(<EventCalendar events={family} lanes={people} layout="weeks" weeks={1} weekStartsOn={0} anchor="2026-11-04" onAnchorChange={() => {}} timeZone={Z} locale="en-US" />);
    const cell = document.querySelector('[data-day="2026-11-02"]') as HTMLElement;
    const item = within(cell).getByTestId("event-calendar-item");
    expect(item.textContent).toContain("Dinner out");
    expect(item.textContent).toContain("with Ana, Ben");
    expect(item.querySelectorAll("[style]")).toHaveLength(2);
    // Camp covers Thursday to Saturday.
    expect(document.querySelectorAll('[data-event="camp"]')).toHaveLength(3);
    expect(screen.getByRole("heading").textContent).toBe("Nov 1 – Nov 7");
  });

  it("shows the month with its leading and trailing days, and steps a month at a time", () => {
    const onAnchorChange = vi.fn();
    render(<EventCalendar events={[]} anchor="2026-11-15" onAnchorChange={onAnchorChange} weekStartsOn={0} timeZone={Z} locale="en-US" />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(35);
    expect(screen.getByRole("heading").textContent).toBe("November 2026");
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(onAnchorChange).toHaveBeenCalledWith("2026-12-15");
  });

  it("selects an event by click or keyboard, and only makes buttons when it can", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<EventCalendar events={family} layout="weeks" weeks={1} anchor="2026-11-04" timeZone={Z} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Dentist/ }));
    expect(onSelect).toHaveBeenCalledWith(family[2]);
    rerender(<EventCalendar events={family} layout="weeks" weeks={1} anchor="2026-11-04" timeZone={Z} />);
    expect(screen.queryByRole("button", { name: /Dentist/ })).toBeNull();
  });

  it("moves between days with the arrow keys, one tab stop for the grid", () => {
    render(<EventCalendar events={[]} layout="weeks" weeks={2} weekStartsOn={0} anchor="2026-11-04" timeZone={Z} />);
    const cells = screen.getAllByRole("gridcell");
    const tabbable = cells.filter((c) => c.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    const first = cells[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-02");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-09");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-14");
    expect(document.activeElement?.tabIndex).toBe(0);
  });

  it("lists the agenda day by day, skipping empty days, made to print", () => {
    render(<EventCalendar events={family} layout="agenda" weeks={1} weekStartsOn={0} anchor="2026-11-04" timeZone={Z} locale="en-US" />);
    const days = screen.getAllByTestId("event-calendar-day");
    expect(days.map((d) => d.getAttribute("data-day"))).toEqual(["2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(within(days[0]!).getByRole("heading").textContent).toBe("Monday, November 2");
    expect(days[0]!.className).toContain("print:break-inside-avoid");
    expect(days[2]!.textContent).toContain("All day");
    expect(screen.getByRole("button", { name: "Today" }).parentElement!.className).toContain("print:hidden");
  });

  it("can show empty days in the agenda, and says when nothing is on", () => {
    const { rerender } = render(<EventCalendar events={[]} layout="agenda" weeks={1} anchor="2026-11-04" timeZone={Z} />);
    expect(screen.getByText("Nothing scheduled")).toBeTruthy();
    rerender(<EventCalendar events={[]} layout="agenda" weeks={1} anchor="2026-11-04" timeZone={Z} showEmptyDays />);
    expect(screen.getAllByTestId("event-calendar-day")).toHaveLength(7);
  });

  it("gives each person a lane, a shared event in each of theirs", () => {
    render(<EventCalendar events={family} lanes={people} layout="lanes" weeks={1} weekStartsOn={0} anchor="2026-11-04" timeZone={Z} />);
    const lanes = screen.getAllByTestId("event-calendar-lane");
    expect(lanes.map((l) => l.getAttribute("data-lane"))).toEqual(["ana", "ben"]);
    expect(within(lanes[0]!).getByText("Dinner out")).toBeTruthy();
    expect(within(lanes[1]!).getByText("Dinner out")).toBeTruthy();
    expect(within(lanes[0]!).queryByText("Camp")).toBeNull();
    expect(within(lanes[1]!).getAllByText("Camp")).toHaveLength(3);
  });
});

type Event = { id: string; household_id: string; title: string; starts_at: string; ends_at: string | null; who: string[] };

const events = defineResource<Event>()({
  name: "events",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "household_id", type: "string" },
    { name: "title", type: "string" },
    { name: "starts_at", type: "datetime", dbType: "timestamp with time zone" },
    { name: "ends_at", type: "datetime", dbType: "timestamp with time zone", nullable: true },
    { name: "who", type: "string", array: true },
  ],
});
const eventsView = defineView(events, {
  scope: ["household_id"],
  columns: { default: ["title", "starts_at"] },
  calendar: { field: "starts_at", endField: "ends_at", laneBy: "who", layout: "weeks", weeks: 2, weekStartsOn: 0 },
});
const ROWS: Event[] = [
  { id: "e1", household_id: "h1", title: "Swim meet", starts_at: "2026-11-07 15:00:00+00", ends_at: "2026-11-07 18:00:00+00", who: ["ana"] },
  { id: "e2", household_id: "h1", title: "Recital", starts_at: "2026-11-10T01:00:00Z", ends_at: null, who: ["ana", "ben"] },
];

/** A provider that applies the filters the calendar sends, the way a database would. */
function filtering(rows: Event[], total?: (matched: Event[]) => number, limitTo?: number) {
  const getList = vi.fn(async (_r: string, params: { filters?: FilterParam[]; pagination?: { perPage: number } }) => {
    const matched = rows.filter((row) =>
      (params.filters ?? []).every((f) => {
        const v = (row as unknown as Record<string, unknown>)[f.field];
        const at = (x: unknown) => (typeof x === "string" ? Date.parse(x.includes("T") || x.includes(" ") ? x.replace(" ", "T").replace(/\+00$/, "Z") : x) : NaN);
        switch (f.operator) {
          case "eq":
            return v === f.value;
          case "is_null":
            return v === null || v === undefined;
          case "gte":
            return v !== null && at(v) >= at(f.value);
          case "gt":
            return v !== null && at(v) > at(f.value);
          case "lt":
            return v !== null && at(v) < at(f.value);
          default:
            return true;
        }
      }),
    );
    const cut = matched.slice(0, Math.min(params.pagination?.perPage ?? Infinity, limitTo ?? Infinity));
    return { data: cut, total: total ? total(matched) : matched.length };
  });
  return {
    getList,
    p: { getList, getOne: vi.fn(), getMany: vi.fn(async () => ({ data: [] })), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider,
  };
}

function wrap(p: DataProvider, scope?: Record<string, string>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {scope ? (
        <ViewerScope viewer="u1" scope={scope}>{children}</ViewerScope>
      ) : (
        children
      )}
    </GenesisProvider>
  );
}

describe("ResourceView mode=calendar", () => {
  const provider = () => filtering(ROWS);

  it("asks for the visible window only, inside the viewer's scope, and places rows with their lanes", async () => {
    const { p, getList } = provider();
    render(
      <ResourceView
        view={eventsView}
        mode="calendar"
        calendar={{ timeZone: Z, anchor: "2026-11-04", onAnchorChange: () => {}, lanes: people }}
      />,
      { wrapper: wrap(p, { household_id: "h1" }) },
    );
    expect(await screen.findByText("Swim meet")).toBeTruthy();
    const sent = getList.mock.calls.map((c) => (c as unknown as [string, { filters: FilterParam[] }])[1].filters);
    // Rows that start in the window, whatever their end, and rows that started before it and run
    // into it. No look-back, no overlap, no gap.
    expect(sent).toContainEqual([
      { field: "household_id", operator: "eq", value: "h1" },
      { field: "starts_at", operator: "gte", value: "2026-11-01T06:00:00.000Z" },
      { field: "starts_at", operator: "lt", value: "2026-11-15T07:00:00.000Z" },
    ]);
    expect(sent).toContainEqual([
      { field: "household_id", operator: "eq", value: "h1" },
      { field: "starts_at", operator: "lt", value: "2026-11-01T06:00:00.000Z" },
      { field: "ends_at", operator: "gt", value: "2026-11-01T06:00:00.000Z" },
    ]);
    // 18:00 on 9 November in Denver.
    const recital = screen.getByRole("button", { name: /Recital/ });
    expect(recital.closest("[data-day]")!.getAttribute("data-day")).toBe("2026-11-09");
    expect(recital.textContent).toContain("with Ana, Ben");
  });

  it("opens the view's peek on click, or the screen's onSelect", async () => {
    const { p } = provider();
    const onSelect = vi.fn();
    const { unmount } = render(
      <ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ field: "starts_at", anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />,
      { wrapper: wrap(p) },
    );
    fireEvent.click(await screen.findByRole("button", { name: /Swim meet/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(within(screen.getByRole("dialog")).getAllByText("Swim meet").length).toBeGreaterThan(0);
    unmount();
    render(
      <ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ field: "starts_at", anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z, onSelect }} />,
      { wrapper: wrap(provider().p) },
    );
    fireEvent.click(await screen.findByRole("button", { name: /Swim meet/ }));
    expect(onSelect).toHaveBeenCalledWith(ROWS[0]);
  });

  it("switches layout from its toolbar when given several", async () => {
    const { p } = provider();
    render(
      <ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ field: "starts_at", anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z, layouts: ["month", "agenda"] }} />,
      { wrapper: wrap(p) },
    );
    await screen.findByText("Swim meet");
    fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
    expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("agenda");
  });

  it("refuses calendar mode without a field, and a field the view lacks", () => {
    const { p } = provider();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const plain = defineView(events, { columns: { default: ["title"] } });
    expect(() => render(<ResourceView view={plain} mode="calendar" />, { wrapper: wrap(p) })).toThrow(/needs a calendar field/);
    expect(() => render(<ResourceView view={eventsView} mode="calendar" calendar={{ field: "nope" }} />, { wrapper: wrap(p) })).toThrow(/"nope"/);
  });
});

describe("ResourceView mode=calendar: the view's block, the cap, the clock", () => {
  const listing = (data: Event[]) => filtering(data);

  it("draws from the view's calendar block alone, and the screen overrides its layout", async () => {
    const { p } = listing(ROWS);
    const { unmount } = render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(p) });
    expect(await screen.findByText("Swim meet")).toBeTruthy();
    expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("weeks");
    // Sunday first, two weeks: 1 to 14 November.
    expect(screen.getAllByRole("gridcell")).toHaveLength(14);
    expect(screen.getAllByRole("gridcell")[0]!.getAttribute("data-day")).toBe("2026-11-01");
    unmount();
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ layout: "agenda", weeks: 1, anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(listing(ROWS).p) });
    await screen.findByText("Swim meet");
    expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("agenda");
  });

  it("says how many rows in the window it left out past the cap, counting only rows in the window", async () => {
    // Seven swims in the window; one long-gone row the overlap filter never matches.
    const swims: Event[] = Array.from({ length: 7 }, (_, i) => ({ ...ROWS[0]!, id: `s${i}`, title: `Swim ${i}`, starts_at: `2026-11-0${i + 2}T15:00:00Z`, ends_at: `2026-11-0${i + 2}T16:00:00Z` }));
    const old: Event = { ...ROWS[0]!, id: "old", title: "Old", starts_at: "2026-09-01T15:00:00Z", ends_at: "2026-09-01T16:00:00Z" };
    const { p, getList } = filtering([...swims, old]);
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ limit: 2, anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(p) });
    expect((await screen.findByTestId("resource-calendar-capped")).textContent).toBe("+5 more not shown. Narrow the calendar or filter it to see them.");
    expect(screen.getAllByTestId("resource-calendar-item")).toHaveLength(2);
    expect((getList.mock.calls[0] as unknown as [string, { pagination: { perPage: number } }])[1].pagination.perPage).toBe(2);
  });

  it("shows nothing about a cap when everything fits", async () => {
    const { p } = listing(ROWS);
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(p) });
    await screen.findByText("Swim meet");
    expect(screen.queryByTestId("resource-calendar-capped")).toBeNull();
  });

  it("lands timestamps on the viewer's day, or the scope's when the field says so", async () => {
    // 01:00 UTC on 10 November: the 9th in Denver, the 10th in Tokyo.
    const { p } = listing(ROWS);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <GenesisProvider provider={p} queryClient={queryClient}>
        <ViewerScope viewer="u1" timeZone="Asia/Tokyo">
          <ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {} }} />
        </ViewerScope>
      </GenesisProvider>,
    );
    expect((await screen.findByRole("button", { name: /Recital/ })).closest("[data-day]")!.getAttribute("data-day")).toBe("2026-11-10");
    unmount();
    const scoped = defineView(events, { columns: { default: ["title"] }, fields: { starts_at: { timeZone: "scope" } }, calendar: { field: "starts_at", layout: "weeks" } });
    render(
      <GenesisProvider provider={listing(ROWS).p} queryClient={new QueryClient()}>
        <ViewerScope viewer="u1" timeZone="Asia/Tokyo" scopeTimeZone={Z}>
          <ResourceView view={scoped} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {} }} />
        </ViewerScope>
      </GenesisProvider>,
    );
    expect((await screen.findByRole("button", { name: /Recital/ })).closest("[data-day]")!.getAttribute("data-day")).toBe("2026-11-09");
  });

  it("never stores calendar as the list's remembered view", async () => {
    localStorage.clear();
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(listing(ROWS).p) });
    await screen.findByText("Swim meet");
    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k));
    expect(stored.some((v) => v?.includes("calendar"))).toBe(false);
  });
});

describe("EventCalendar day cells", () => {
  it("names each day with its date and how many events it has", () => {
    render(<EventCalendar events={family} layout="weeks" weeks={1} weekStartsOn={0} anchor="2026-11-04" timeZone={Z} locale="en-US" />);
    const label = (day: string) => document.querySelector(`[data-day="${day}"]`)!.getAttribute("aria-label");
    expect(label("2026-11-02")).toBe("Monday, November 2, 2026, 1 event");
    expect(label("2026-11-01")).toBe("Sunday, November 1, 2026");
  });

  it("pages the window with PageUp and PageDown, keeping the focused day's place", async () => {
    function Controlled() {
      const [anchor, setAnchor] = useState("2026-11-04");
      return <EventCalendar events={[]} layout="month" weekStartsOn={0} anchor={anchor} onAnchorChange={setAnchor} timeZone={Z} locale="en-US" />;
    }
    render(<Controlled />);
    const cell = document.querySelector('[data-day="2026-11-17"]') as HTMLElement;
    cell.focus();
    fireEvent.keyDown(cell, { key: "PageDown" });
    await waitFor(() => expect(document.activeElement?.getAttribute("data-day")).toBe("2026-12-17"));
    expect(screen.getByRole("heading").textContent).toBe("December 2026");
    fireEvent.keyDown(document.activeElement!, { key: "PageUp" });
    await waitFor(() => expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-17"));
  });
});

describe("ResourceView mode=calendar: review fixes", () => {
  it("shows a long event that started weeks before the window", async () => {
    const long: Event = { ...ROWS[0]!, id: "term", title: "School term", starts_at: "2026-09-20T15:00:00Z", ends_at: "2026-12-20T16:00:00Z" };
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(filtering([long]).p) });
    expect(await screen.findAllByText("School term")).toHaveLength(14);
  });

  it("refetches when the resource changes, like any list", async () => {
    const { p, getList } = filtering(ROWS);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <GenesisProvider provider={p} queryClient={queryClient}>
        <ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />
      </GenesisProvider>,
    );
    await screen.findByText("Swim meet");
    const before = getList.mock.calls.length;
    await queryClient.invalidateQueries({ queryKey: ["events"] });
    await waitFor(() => expect(getList.mock.calls.length).toBeGreaterThan(before));
  });

  it("ends an all-day row stored as instants the day before its end", async () => {
    const allDay = defineView(
      defineResource<Event & { all_day: boolean }>()({ ...events, fields: [...events.fields, { name: "all_day", type: "boolean" }] }),
      { columns: { default: ["title"] }, calendar: { field: "starts_at", endField: "ends_at", allDayField: "all_day", layout: "weeks", weeks: 1, weekStartsOn: 0 } },
    );
    // Midnight to midnight in Denver: 2 November only.
    const row = { ...ROWS[0]!, id: "a", title: "Day off", starts_at: "2026-11-02T07:00:00Z", ends_at: "2026-11-03T07:00:00Z", all_day: true };
    render(<ResourceView view={allDay} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, {
      wrapper: wrap(filtering([row as unknown as Event]).p),
    });
    const items = await screen.findAllByText("Day off");
    expect(items.map((i) => i.closest("[data-day]")!.getAttribute("data-day"))).toEqual(["2026-11-02"]);
  });

  it("bounds and reads a timestamp without a zone on the calendar's clock", async () => {
    const wall = defineResource<Event>()({
      ...events,
      fields: events.fields.map((f) => (f.name === "starts_at" ? { ...f, dbType: "timestamp without time zone" } : f)),
    });
    const wallView = defineView(wall, { columns: { default: ["title"] }, calendar: { field: "starts_at", layout: "weeks", weeks: 1, weekStartsOn: 0 } });
    const row = { ...ROWS[0]!, id: "w", title: "Late swim", starts_at: "2026-11-03 23:30:00", ends_at: null };
    const getList = vi.fn(async () => ({ data: [row], total: 1 }));
    const p = { getList, getOne: vi.fn(), getMany: vi.fn(async () => ({ data: [] })), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider;
    render(<ResourceView view={wallView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: "Asia/Tokyo" }} />, { wrapper: wrap(p) });
    // 23:30 on the 3rd stays on the 3rd: it's a wall time, not UTC.
    expect((await screen.findByText("Late swim")).closest("[data-day]")!.getAttribute("data-day")).toBe("2026-11-03");
    expect((getList.mock.calls[0] as unknown as [string, { filters: FilterParam[] }])[1].filters).toEqual([
      { field: "starts_at", operator: "gte", value: "2026-11-01T00:00:00" },
      { field: "starts_at", operator: "lt", value: "2026-11-08T00:00:00" },
    ]);
  });

  it("refuses calendar mode in the headless hook rather than returning table state", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useResourceView({ view: eventsView, mode: "calendar" }), { wrapper: wrap(filtering(ROWS).p) })).toThrow(/calendar mode has no table state/);
  });

  it("refuses a preset the view doesn't have", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ResourceView view={eventsView} mode="calendar" preset="nope" />, { wrapper: wrap(filtering(ROWS).p) })).toThrow(/no preset "nope"/);
  });

  it("draws the peek's fields with the screen's cells", async () => {
    render(
      <ResourceView view={eventsView} mode="calendar" scoped={false} cells={{ title: (r) => <i>★ {r.title as string}</i> }} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />,
      { wrapper: wrap(filtering(ROWS).p) },
    );
    fireEvent.click(await screen.findByRole("button", { name: /Swim meet/ }));
    expect(await within(await screen.findByRole("dialog")).findByText("★ Swim meet")).toBeTruthy();
  });

  it("switches between calendar and table on one mounted ResourceView", async () => {
    function Switch() {
      const [mode, setMode] = useState<"calendar" | "table">("calendar");
      return (
        <>
          <button type="button" onClick={() => setMode(mode === "calendar" ? "table" : "calendar")}>switch</button>
          <ResourceView view={eventsView} mode={mode} scoped={false} detail="none" calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />
        </>
      );
    }
    render(<Switch />, { wrapper: wrap(filtering(ROWS).p) });
    await screen.findByTestId("resource-calendar");
    fireEvent.click(screen.getByText("switch"));
    expect(await screen.findByRole("columnheader", { name: /Title/ })).toBeTruthy();
    fireEvent.click(screen.getByText("switch"));
    expect(await screen.findByTestId("resource-calendar")).toBeTruthy();
  });
});

describe("EventCalendar: review fixes", () => {
  it("shows a few events per day and the rest behind +N more, all of them in print", () => {
    const busy: CalendarEvent[] = Array.from({ length: 5 }, (_, i) => ({ key: `b${i}`, title: `Busy ${i}`, start: at(`2026-11-02T1${i}:00:00Z`) }));
    render(<EventCalendar events={busy} layout="month" weekStartsOn={0} anchor="2026-11-04" timeZone={Z} />);
    const cell = document.querySelector('[data-day="2026-11-02"]') as HTMLElement;
    const more = within(cell).getByTestId("event-calendar-more");
    expect(more.textContent).toBe("+2 more");
    expect(within(cell).getAllByTestId("event-calendar-item").filter((el) => !el.closest("li")!.className.includes("hidden"))).toHaveLength(3);
    expect(cell.querySelectorAll("li.print\\:list-item")).toHaveLength(2);
    fireEvent.click(more);
    expect(within(cell).queryByTestId("event-calendar-more")).toBeNull();
    expect(cell.querySelectorAll("li.hidden")).toHaveLength(0);
  });

  it("gives events with no lane an Unassigned lane", () => {
    const loose: CalendarEvent[] = [...family, { key: "bins", title: "Bins out", start: "2026-11-03" }];
    render(<EventCalendar events={loose} lanes={people} layout="lanes" weeks={1} weekStartsOn={0} anchor="2026-11-04" timeZone={Z} />);
    const lanes = screen.getAllByTestId("event-calendar-lane");
    expect(lanes).toHaveLength(3);
    expect(within(lanes[2]!).getByRole("rowheader").textContent).toBe("Unassigned");
    expect(within(lanes[2]!).getByText("Bins out")).toBeTruthy();
  });

  it("makes the lanes a keyboard grid whose cells name the lane, day and count", () => {
    render(<EventCalendar events={family} lanes={people} layout="lanes" weeks={1} weekStartsOn={0} anchor="2026-11-04" timeZone={Z} locale="en-US" />);
    expect(screen.getByRole("grid")).toBeTruthy();
    const cells = screen.getAllByRole("gridcell");
    expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    const ana = cells.find((c) => c.getAttribute("aria-label") === "Ana, Monday, November 2, 2026, 1 event")!;
    ana.focus();
    fireEvent.keyDown(ana, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Ben, Monday, November 2, 2026, 1 event");
  });

  it("moves the window when an arrow goes past the grid's edge", async () => {
    function Controlled() {
      const [anchor, setAnchor] = useState("2026-11-04");
      return <EventCalendar events={[]} layout="weeks" weeks={1} weekStartsOn={0} anchor={anchor} onAnchorChange={setAnchor} timeZone={Z} locale="en-US" />;
    }
    render(<Controlled />);
    const sat = document.querySelector('[data-day="2026-11-07"]') as HTMLElement;
    sat.focus();
    fireEvent.keyDown(sat, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-08"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-01"));
  });

  it("follows a new anchor from its parent when uncontrolled", () => {
    const { rerender } = render(<EventCalendar events={[]} layout="month" anchor="2026-11-04" timeZone={Z} locale="en-US" />);
    expect(screen.getByRole("heading").textContent).toBe("November 2026");
    rerender(<EventCalendar events={[]} layout="month" anchor="2027-02-10" timeZone={Z} locale="en-US" />);
    expect(screen.getByRole("heading").textContent).toBe("February 2027");
  });

  it("names both years in a title that crosses New Year", () => {
    render(<EventCalendar events={[]} layout="weeks" weeks={2} weekStartsOn={0} anchor="2026-12-30" timeZone={Z} locale="en-US" />);
    expect(screen.getByRole("heading").textContent).toBe("Dec 27, 2026 – Jan 9, 2027");
  });

  it("lets a printed grid grow instead of scrolling", () => {
    render(<EventCalendar events={family} layout="month" anchor="2026-11-04" timeZone={Z} />);
    expect(screen.getByRole("grid").parentElement!.className).toContain("print:overflow-visible");
  });
});

describe("EventCalendar and ResourceCalendar: second review", () => {
  function Controlled(props: { layout: "month" | "weeks"; weeks?: 1 | 2 | 3 | 4; weekStartsOn: 0 | 1 }) {
    const [anchor, setAnchor] = useState("2026-11-04");
    return <EventCalendar events={[]} {...props} anchor={anchor} onAnchorChange={setAnchor} timeZone={Z} locale="en-US" />;
  }

  it("runs Left and Right on into the next or previous week instead of paging, in a month grid", async () => {
    render(<Controlled layout="month" weekStartsOn={1} />);
    const sun = document.querySelector('[data-day="2026-11-08"]') as HTMLElement;
    sun.focus();
    fireEvent.keyDown(sun, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-09");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-08");
    expect(screen.getByRole("heading").textContent).toBe("November 2026");
  });

  it("does the same in a two-week grid, and pages only past its last day", async () => {
    render(<Controlled layout="weeks" weeks={2} weekStartsOn={0} />);
    const sat = document.querySelector('[data-day="2026-11-07"]') as HTMLElement;
    sat.focus();
    fireEvent.keyDown(sat, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-08");
    expect(screen.getByRole("heading").textContent).toBe("Nov 1 – Nov 14");
    const last = document.querySelector('[data-day="2026-11-14"]') as HTMLElement;
    last.focus();
    fireEvent.keyDown(last, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-15"));
  });

  it("keeps focus on PageDown from a day the next window doesn't hold", async () => {
    render(<Controlled layout="month" weekStartsOn={1} />);
    // 26 October leads November's grid; 26 November isn't in December's, so focus takes the same cell.
    const lead = document.querySelector('[data-day="2026-10-26"]') as HTMLElement;
    lead.focus();
    fireEvent.keyDown(lead, { key: "PageDown" });
    await waitFor(() => expect(document.activeElement?.getAttribute("data-day")).toBe("2026-11-30"));
    expect(screen.getByRole("heading").textContent).toBe("December 2026");
  });

  it("names the +N more button after the calendar's test id", () => {
    const busy: CalendarEvent[] = Array.from({ length: 5 }, (_, i) => ({ key: `b${i}`, title: `Busy ${i}`, start: at(`2026-11-02T1${i}:00:00Z`) }));
    render(<EventCalendar events={busy} layout="month" anchor="2026-11-04" timeZone={Z} testID="family" />);
    expect(screen.getByTestId("family-more").textContent).toBe("+2 more");
  });

  it("says nothing is scheduled on lanes with no lanes and no events", () => {
    render(<EventCalendar events={[]} layout="lanes" anchor="2026-11-04" timeZone={Z} />);
    expect(screen.getByText("Nothing scheduled")).toBeTruthy();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("is busy, not empty, while loading", () => {
    const { rerender } = render(<EventCalendar events={[]} layout="agenda" anchor="2026-11-04" timeZone={Z} loading />);
    expect(screen.getByTestId("event-calendar").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Nothing scheduled")).toBeNull();
    rerender(<EventCalendar events={[]} layout="agenda" anchor="2026-11-04" timeZone={Z} />);
    expect(screen.getByTestId("event-calendar").getAttribute("aria-busy")).toBeNull();
    expect(screen.getByText("Nothing scheduled")).toBeTruthy();
  });

  it("is busy while its first request is pending", async () => {
    let resolve: (v: { data: Event[]; total: number }) => void = () => {};
    const getList = vi.fn(() => new Promise<{ data: Event[]; total: number }>((r) => (resolve = r)));
    const p = { getList, getOne: vi.fn(), getMany: vi.fn(async () => ({ data: [] })), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider;
    const plain = defineView(events, { columns: { default: ["title"] }, calendar: { field: "starts_at", layout: "agenda", weeks: 1 } });
    render(<ResourceView view={plain} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(p) });
    expect(screen.getByTestId("resource-calendar").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Nothing scheduled")).toBeNull();
    resolve({ data: [], total: 0 });
    await waitFor(() => expect(screen.getByText("Nothing scheduled")).toBeTruthy());
    expect(screen.getByTestId("resource-calendar").getAttribute("aria-busy")).toBeNull();
  });

  it("doesn't spend the cap on rows that end exactly at the window's first midnight", async () => {
    const ended = (id: string): Event => ({ ...ROWS[0]!, id, title: `Ended ${id}`, starts_at: "2026-10-31T20:00:00Z", ends_at: "2026-11-01T06:00:00Z" });
    const real: Event = { ...ROWS[0]!, id: "real", title: "Real", starts_at: "2026-11-05T15:00:00Z", ends_at: "2026-11-05T16:00:00Z" };
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ limit: 2, anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, {
      wrapper: wrap(filtering([ended("a"), ended("b"), real]).p),
    });
    expect(await screen.findByText("Real")).toBeTruthy();
    expect(screen.queryByTestId("resource-calendar-capped")).toBeNull();
  });

  it("keeps the cap notice when printing", async () => {
    const swims: Event[] = Array.from({ length: 3 }, (_, i) => ({ ...ROWS[0]!, id: `s${i}`, title: `Swim ${i}`, starts_at: `2026-11-0${i + 2}T15:00:00Z`, ends_at: `2026-11-0${i + 2}T16:00:00Z` }));
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ limit: 1, anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(filtering(swims).p) });
    expect((await screen.findByTestId("resource-calendar-capped")).className).not.toContain("print:hidden");
  });
});

describe("ResourceCalendar: a screen's overrides get the view's checks", () => {
  it("refuses an override naming a missing field, a field that isn't a date, or out-of-range weeks", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const p = filtering(ROWS).p;
    expect(() => render(<ResourceView view={eventsView} mode="calendar" calendar={{ endField: "nope" }} />, { wrapper: wrap(p) })).toThrow(/calendar\.endField names "nope"/);
    expect(() => render(<ResourceView view={eventsView} mode="calendar" calendar={{ field: "title" }} />, { wrapper: wrap(p) })).toThrow(/calendar\.field "title" isn't a date or timestamp field/);
    expect(() => render(<ResourceView view={eventsView} mode="calendar" calendar={{ weeks: 6 as never }} />, { wrapper: wrap(p) })).toThrow(/calendar\.weeks is 1 to 4/);
  });
});

describe("calendar follow-up: URL values and the window's first midnight", () => {
  it("shows the month and today for a layout or anchor no calendar has, warning in development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ layout: "year" as never, onLayoutChange: () => {}, anchor: "2026-13-45", onAnchorChange: () => {}, timeZone: Z }} />,
      { wrapper: wrap(filtering(ROWS).p) },
    );
    expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("month");
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringMatching(/layout "year"/), expect.stringMatching(/anchor "2026-13-45"/)]),
    );
  });

  it("does the same on EventCalendar itself", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<EventCalendar events={[]} layout={"year" as never} anchor="nope" timeZone={Z} />);
    expect(screen.getByTestId("event-calendar").getAttribute("data-layout")).toBe("month");
  });

  it("still throws for a configuration mistake", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ResourceView view={eventsView} mode="calendar" calendar={{ weekStartsOn: 3 as never }} />, { wrapper: wrap(filtering(ROWS).p) })).toThrow(/weekStartsOn/);
  });

  it("fetches a zero-length event at the window's first midnight", async () => {
    const moment: Event = { ...ROWS[0]!, id: "m", title: "Midnight", starts_at: "2026-11-01T06:00:00Z", ends_at: "2026-11-01T06:00:00Z" };
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, {
      wrapper: wrap(filtering([moment]).p),
    });
    expect((await screen.findByText("Midnight")).closest("[data-day]")!.getAttribute("data-day")).toBe("2026-11-01");
  });
});

describe("calendar follow-up: optimistic writes reach the calendar", () => {
  it("shows an optimistic update before the server answers, like any list", async () => {
    const { p } = filtering(ROWS);
    // The server never answers, so only the optimistic patch can change the title.
    (p as unknown as { update: unknown }).update = vi.fn(() => new Promise(() => {}));
    let update: ((id: string, data: Partial<Event>) => Promise<unknown>) | undefined;
    function Writer() {
      const r = useResource<Event>("events", { mutationMode: "optimistic" });
      update = r.update;
      return null;
    }
    render(
      <>
        <ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />
        <Writer />
      </>,
      { wrapper: wrap(p) },
    );
    await screen.findByText("Swim meet");
    void update!("e1", { title: "Swim gala" });
    expect(await screen.findByText("Swim gala")).toBeTruthy();
    expect(screen.queryByText("Swim meet")).toBeNull();
  });
});
