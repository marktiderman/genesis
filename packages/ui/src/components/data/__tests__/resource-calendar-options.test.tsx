/**
 * ResourceView's calendar mode, the options a consumer app asked for:
 * - `classNameOf` and `statusOf`: a cancelled event struck through, with words, rather than dropped
 *   (EventCalendar's `className` and `status`, and the printed agenda);
 * - `phoneLayout`: a phone opens the agenda until the person picks a layout; unset, nothing changes;
 * - `durationField`: an end from the start plus a duration, in the view's unit;
 * - the screen's `subtitle` (else the view's `copy.subtitle`) stays under the title.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { EventCalendar, PrintableAgenda } from "../calendar";
import { ResourceView } from "../resource-view";

const Z = "America/Denver";

type Session = { id: string; title: string; starts_at: string; minutes: number | null; status: "on" | "cancelled" };

const sessions = defineResource<Session>()({
  name: "sessions",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "starts_at", type: "datetime", dbType: "timestamp with time zone" },
    { name: "minutes", type: "number", nullable: true },
    { name: "status", type: "string", enumValues: ["on", "cancelled"] },
  ],
});

const ROWS: Session[] = [
  // 11pm in Denver on the 5th, for three hours: it runs into the 6th.
  { id: "a", title: "Late swim", starts_at: "2026-11-06T06:00:00Z", minutes: 180, status: "on" },
  { id: "b", title: "Yoga", starts_at: "2026-11-09T16:00:00Z", minutes: 60, status: "cancelled" },
];

function provider(rows: Session[] = ROWS): DataProvider {
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

function viewport(phone: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: phone,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

afterEach(() => vi.restoreAllMocks());

const base = { anchor: "2026-11-04", onAnchorChange: () => {}, timeZone: Z } as const;

describe("calendar mode: a cancelled event is struck through, not dropped", () => {
  const view = defineView(sessions, { calendar: { field: "starts_at", layout: "weeks", weeks: 2, weekStartsOn: 0 } });

  it("gives a row's event its classes and its words", async () => {
    render(
      <ResourceView
        view={view}
        mode="calendar"
        calendar={{
          ...base,
          classNameOf: (r) => (r.status === "cancelled" ? "line-through opacity-60" : undefined),
          statusOf: (r) => (r.status === "cancelled" ? "Cancelled" : undefined),
        }}
      />,
      { wrapper: wrap(provider()) },
    );
    const yoga = await screen.findByRole("button", { name: /Yoga/ });
    expect(yoga.className).toContain("line-through");
    expect(yoga.textContent).toContain(", Cancelled");
    const swim = screen.getAllByRole("button", { name: /Late swim/ })[0]!;
    expect(swim.className).not.toContain("line-through");
  });

  it("strikes it out on the printed agenda too, with the words on paper", () => {
    render(
      <PrintableAgenda
        events={[{ key: "y", title: "Yoga", start: new Date("2026-11-09T16:00:00Z"), lanes: ["ana"], className: "line-through", status: "Cancelled" }]}
        lanes={[{ key: "ana", label: "Ana" }]}
        anchor="2026-11-09"
        timeZone={Z}
      />,
    );
    const line = screen.getByText("Yoga").closest("li")!;
    expect(line.className).toContain("line-through");
    expect(within(line).getByText(/Cancelled/).className).toContain("print:not-sr-only");
  });

  it("is EventCalendar's own: an event's className and status", () => {
    render(<EventCalendar events={[{ key: "y", title: "Yoga", start: "2026-11-09", className: "line-through", status: "Cancelled" }]} anchor="2026-11-09" timeZone={Z} />);
    const item = screen.getByText("Yoga").closest("[data-testid='event-calendar-item']")!;
    expect(item.className).toContain("line-through");
    expect(item.textContent).toContain(", Cancelled");
  });
});

describe("calendar mode: the agenda on a phone", () => {
  const view = defineView(sessions, { calendar: { field: "starts_at", layout: "month", phoneLayout: "agenda" } });

  it("opens the phone layout below 768px, and the view's layout above", async () => {
    viewport(true);
    const { unmount } = render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider()) });
    await screen.findAllByText("Yoga");
    expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("agenda");
    unmount();
    vi.restoreAllMocks();
    viewport(false);
    render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider()) });
    await screen.findAllByText("Yoga");
    expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("month");
  });

  it("gives way to the person's pick from the switch", async () => {
    viewport(true);
    render(<ResourceView view={view} mode="calendar" calendar={{ ...base, layouts: ["month", "agenda"] }} />, { wrapper: wrap(provider()) });
    await screen.findAllByText("Yoga");
    fireEvent.click(screen.getByTestId("resource-calendar-layout-month"));
    await waitFor(() => expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("month"));
  });

  it("changes nothing on a phone without it", async () => {
    viewport(true);
    const plain = defineView(sessions, { calendar: { field: "starts_at", layout: "month" } });
    render(<ResourceView view={plain} mode="calendar" calendar={base} />, { wrapper: wrap(provider()) });
    await screen.findAllByText("Yoga");
    expect(screen.getByTestId("resource-calendar").getAttribute("data-layout")).toBe("month");
  });
});

describe("calendar mode: an end from a duration", () => {
  it("runs a row from its start for its duration, in minutes by default", async () => {
    const view = defineView(sessions, { calendar: { field: "starts_at", durationField: "minutes", layout: "weeks", weeks: 2, weekStartsOn: 0 } });
    render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider()) });
    const days = (await screen.findAllByRole("button", { name: /Late swim/ })).map((b) => b.closest("[data-day]")!.getAttribute("data-day"));
    // 11pm to 2am: on the 5th and the 6th.
    expect(days).toEqual(["2026-11-05", "2026-11-06"]);
    expect(screen.getAllByRole("button", { name: /Yoga/ })).toHaveLength(1);
  });

  it("reads the view's unit, and keeps one day for a row with no duration", async () => {
    const view = defineView(sessions, { calendar: { field: "starts_at", durationField: "minutes", durationUnit: "hours", layout: "weeks", weeks: 2, weekStartsOn: 0 } });
    const rows: Session[] = [
      { id: "c", title: "Camp", starts_at: "2026-11-05T17:00:00Z", minutes: 48, status: "on" },
      { id: "d", title: "Open", starts_at: "2026-11-05T17:00:00Z", minutes: null, status: "on" },
    ];
    render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider(rows)) });
    const days = (await screen.findAllByRole("button", { name: /Camp/ })).map((b) => b.closest("[data-day]")!.getAttribute("data-day"));
    expect(days).toEqual(["2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(screen.getAllByRole("button", { name: /Open/ })).toHaveLength(1);
  });

  it("refuses a screen's duration field that isn't a number", () => {
    const view = defineView(sessions, { calendar: { field: "starts_at" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ResourceView view={view} mode="calendar" calendar={{ durationField: "title" }} />, { wrapper: wrap(provider()) })).toThrow(
      /calendar\.durationField "title" isn't a number field/,
    );
  });
});

describe("calendar mode: the subtitle", () => {
  it("keeps the screen's subtitle, else the view's", async () => {
    const view = defineView(sessions, { copy: { subtitle: "This term's sessions" }, calendar: { field: "starts_at" } });
    const { unmount } = render(<ResourceView view={view} mode="calendar" calendar={base} />, { wrapper: wrap(provider()) });
    expect(await screen.findByText("This term's sessions")).toBeTruthy();
    unmount();
    render(<ResourceView view={view} mode="calendar" subtitle="Pool only" calendar={base} />, { wrapper: wrap(provider()) });
    expect(await screen.findByText("Pool only")).toBeTruthy();
    expect(screen.queryByText("This term's sessions")).toBeNull();
  });
});
