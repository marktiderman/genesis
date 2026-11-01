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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, ViewerScope, type DataProvider, type FilterParam } from "@marktiderman/genesis-core";
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
  windowBounds,
  type CalendarEvent,
} from "../calendar";
import { ResourceView } from "../resource-view";

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

describe("readEventTime and windowBounds", () => {
  it("reads a date column as a day and a timestamp as an instant", () => {
    expect(readEventTime("2026-11-02", true)).toBe("2026-11-02");
    expect(readEventTime("2026-11-02 09:30:00.123456+00", true)).toBe("2026-11-02");
    expect((readEventTime("2026-11-02 09:30:00.123456+00", false) as Date).toISOString()).toBe("2026-11-02T09:30:00.123Z");
    expect((readEventTime("2026-11-02T09:30:00-0700", false) as Date).toISOString()).toBe("2026-11-02T16:30:00.000Z");
    expect(readEventTime("soon", false)).toBeNull();
  });

  it("bounds a window by days for a date column, by the zone's midnights for a timestamp", () => {
    const range = { start: "2026-11-01", end: "2026-11-08" };
    expect(windowBounds(range, true, Z, 3)).toEqual({ from: "2026-10-29", to: "2026-11-08" });
    expect(windowBounds(range, false, Z)).toEqual({ from: "2026-11-01T06:00:00.000Z", to: "2026-11-08T07:00:00.000Z" });
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
  function provider() {
    const getList = vi.fn(async () => ({ data: ROWS, total: ROWS.length }));
    return {
      getList,
      p: {
        getList,
        getOne: vi.fn(),
        getMany: vi.fn(async () => ({ data: [] })),
        create: vi.fn(),
        update: vi.fn(),
        deleteOne: vi.fn(),
      } as unknown as DataProvider,
    };
  }

  it("asks for the visible window only, inside the viewer's scope, and places rows with their lanes", async () => {
    const { p, getList } = provider();
    render(
      <ResourceView
        view={eventsView}
        mode="calendar"
        calendar={{ timeZone: Z, anchor: "2026-11-04", onAnchorChange: () => {}, lanes: people, maxSpanDays: 1 }}
      />,
      { wrapper: wrap(p, { household_id: "h1" }) },
    );
    expect(await screen.findByText("Swim meet")).toBeTruthy();
    const [, params] = getList.mock.calls[0] as unknown as [string, { filters: FilterParam[] }];
    expect(params.filters).toEqual([
      { field: "household_id", operator: "eq", value: "h1" },
      { field: "starts_at", operator: "gte", value: "2026-10-31T06:00:00.000Z" },
      { field: "starts_at", operator: "lt", value: "2026-11-15T07:00:00.000Z" },
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
  function listing(data: Event[], total = data.length) {
    const getList = vi.fn(async () => ({ data, total }));
    return { getList, p: { getList, getOne: vi.fn(), getMany: vi.fn(async () => ({ data: [] })), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider };
  }

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

  it("says how many rows it left out past the cap", async () => {
    const { p, getList } = listing(ROWS, 7);
    render(<ResourceView view={eventsView} mode="calendar" scoped={false} calendar={{ limit: 2, anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z }} />, { wrapper: wrap(p) });
    expect((await screen.findByTestId("resource-calendar-capped")).textContent).toBe("+5 more not shown. Narrow the calendar or filter it to see them.");
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
    expect(label("2026-11-02")).toBe("Monday, November 2, 1 event");
    expect(label("2026-11-01")).toBe("Sunday, November 1");
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
