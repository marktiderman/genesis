// @feat:custom-views
/**
 * Custom views (ADR 0019): the headless view query (useViewList), the board and calendar data
 * hooks, and <CustomView>, which draws loading, empty and error and hands the app the rows.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataWriteError, defineResource, GenesisProvider, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { CustomView, useViewBoard, useViewCalendarRange, useViewList } from "../resource-view";
import { useBrowserSearchParams } from "../../../navigation";

type Player = { id: string; name: string; team: "red" | "blue" | null; points: number; played_on: string | null; locked: boolean };

const players = defineResource<Player>()({
  name: "players",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "team", type: "string", enumValues: ["red", "blue"], nullable: true },
    { name: "points", type: "number" },
    { name: "played_on", type: "datetime", dbType: "date", nullable: true },
    { name: "locked", type: "boolean", hasDefault: true },
  ],
});

const ROWS: Player[] = [
  { id: "a", name: "Ada", team: "red", points: 30, played_on: "2026-11-03", locked: false },
  { id: "b", name: "Bo", team: "blue", points: 50, played_on: "2026-11-10", locked: true },
  { id: "c", name: "Cy", team: "red", points: 10, played_on: null, locked: false },
];

const matches = (row: Player, f: FilterParam) => {
  const v = row[f.field as keyof Player] as unknown;
  switch (f.operator) {
    case "is_null":
      return v == null;
    case "eq":
      return v === f.value;
    case "gte":
      return v != null && String(v) >= String(f.value);
    case "lt":
      return v != null && String(v) < String(f.value);
    default:
      return true;
  }
};

function provider(rows: Player[] = ROWS.map((r) => ({ ...r })), fail = false): DataProvider {
  return {
    getList: vi.fn(async (_resource: string, params: ListParams) => {
      if (fail) throw new Error("The server is down.");
      let data = rows.filter((row) => (params.filters ?? []).every((f) => matches(row, f)));
      if (params.search?.query) data = data.filter((r) => r.name.toLowerCase().includes(params.search!.query.toLowerCase()));
      if (params.sort) {
        const { field, order } = params.sort;
        data = [...data].sort((x, y) => (Number(x[field as keyof Player]) - Number(y[field as keyof Player])) * (order === "desc" ? -1 : 1));
      }
      const { page = 1, perPage = 50 } = params.pagination ?? {};
      return { data: data.slice((page - 1) * perPage, page * perPage), total: data.length };
    }),
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(async (_resource: string, { id, data }: { id: string; data: Partial<Player> }) => {
      const row = rows.find((r) => r.id === id)!;
      Object.assign(row, data);
      return { data: row };
    }),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

const view = defineView(players, {
  copy: { empty: { title: "No players yet", body: "Add the first one." } },
  orderBy: { field: "points", direction: "desc" },
  groupBy: "team",
  board: { field: "team" },
  calendar: { field: "played_on" },
  can: { update: (row) => (row.locked ? "Locked." : true), delete: () => "Nobody deletes players." },
  presets: { red: { filter: { team: "red" } } },
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useViewList", () => {
  it("loads a page with the view's sort, the preset's filter, a search and permissions", async () => {
    const p = provider();
    const { result } = renderHook(() => useViewList(view, { preset: "red", perPage: 1 }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.id)).toEqual(["a"]);
    expect(result.current.total).toBe(2);
    expect(result.current.pageCount).toBe(2);
    expect(result.current.hasMore).toBe(true);
    const params = vi.mocked(p.getList).mock.calls[0]![1];
    expect(params.sort).toEqual({ field: "points", order: "desc" });
    expect(params.filters).toEqual([{ field: "team", operator: "eq", value: "red" }]);
    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["c"]));
    expect(result.current.can.update(ROWS[1]!)).toBe("Locked.");
    expect(result.current.can.delete(ROWS[0]!)).toBe("Nobody deletes players.");
    act(() => result.current.setSearch("cy"));
    await waitFor(() => expect(vi.mocked(p.getList).mock.calls.at(-1)![1].search).toEqual({ query: "cy", fields: ["name"] }));
    expect(result.current.page).toBe(1);
  });

  it("selects by record key and keeps the open record", async () => {
    const { result } = renderHook(() => useViewList(view), { wrapper: wrap(provider()) });
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    act(() => result.current.selection.toggle(result.current.rows[0]!));
    expect([...result.current.selection.keys]).toEqual(["b"]);
    act(() => result.current.selection.selectPage());
    expect(result.current.selection.keys.size).toBe(3);
    act(() => result.current.selection.clear());
    expect(result.current.selection.keys.size).toBe(0);
    act(() => result.current.open(result.current.rows[1]!));
    expect(result.current.openRow?.id).toBe("a");
    act(() => result.current.close());
    expect(result.current.openRow).toBeNull();
  });

  it("keeps page, search and the open record in the URL with urlState", async () => {
    window.history.replaceState(null, "", "/?page=2&q=");
    const { result } = renderHook(() => useViewList(view, { perPage: 2, urlState: useBrowserSearchParams() }), { wrapper: wrap(provider()) });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["c"]));
    act(() => result.current.open(result.current.rows[0]!));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("id")).toBe("c"));
  });
});

describe("useViewBoard", () => {
  it("gives the view's columns and moves a card through the resource's update", async () => {
    const p = provider();
    const { result } = renderHook(() => useViewBoard(view), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.columns.map((c) => [c.value, c.label, c.items.map((r) => r.id)])).toEqual([
      ["red", "Red", ["a", "c"]],
      ["blue", "Blue", ["b"]],
      ["__genesis_none__", "No value", []],
    ]);
    await act(() => result.current.move(result.current.columns[0]!.items[0]!, "blue"));
    expect(p.update).toHaveBeenCalledWith("players", expect.objectContaining({ id: "a", data: { team: "blue" } }));
    expect(result.current.canMove(ROWS[1]!)).toBe("Locked.");
    await act(async () => {
      await expect(result.current.move({ ...ROWS[1]! }, "red")).rejects.toThrow("Locked.");
    });
    expect(result.current.refusal).toBe("Locked.");
  });

  it("refuses a move when the board's field can't be written, even through move() directly", async () => {
    const readOnly = defineResource<Player>()({ ...players, fields: players.fields.map((f) => (f.name === "team" ? { ...f, readOnly: true } : f)) });
    const frozen = defineView(readOnly, { board: { field: "team" } });
    const p = provider();
    const { result } = renderHook(() => useViewBoard(frozen), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movable).toBe(false);
    expect(result.current.canMove(ROWS[0]!)).not.toBe(true);
    await act(async () => {
      await expect(result.current.move({ ...ROWS[0]! }, "blue")).rejects.toThrow();
    });
    expect(p.update).not.toHaveBeenCalled();
  });

  it("asks the guards again before keeping my move over a conflict", async () => {
    const p = provider();
    let locked = false;
    vi.mocked(p.update).mockRejectedValueOnce(new DataWriteError("conflict", "changed", { current: { ...ROWS[0]!, team: "red", points: 31 }, currentVersion: "2" }));
    const { result } = renderHook(() => useViewBoard(view, { can: () => !locked }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.move({ ...ROWS[0]! }, "blue")).rejects.toThrow("changed");
    });
    expect(result.current.conflict).not.toBeNull();
    // While the conflict is open, the screen stops letting this viewer move cards.
    locked = true;
    await act(async () => {
      await expect(result.current.keepMine()).rejects.toThrow();
    });
    expect(p.update).toHaveBeenCalledTimes(1);
    expect(result.current.conflict).toBeNull();
    expect(result.current.refusal).toBeTruthy();
  });
});

describe("useViewCalendarRange", () => {
  it("loads the rows that start in the window", async () => {
    const p = provider();
    const { result } = renderHook(() => useViewCalendarRange(view, { start: "2026-11-01", end: "2026-11-08" }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.id)).toEqual(["a"]);
    const filters = vi.mocked(p.getList).mock.calls[0]![1].filters;
    expect(filters).toEqual([
      { field: "played_on", operator: "gte", value: "2026-11-01" },
      { field: "played_on", operator: "lt", value: "2026-11-08" },
    ]);
  });

  it("reads rows whose duration runs into the window from before it, as far back as maxDuration", async () => {
    const lasting = defineView(players, { calendar: { field: "played_on", durationField: "points", durationUnit: "days", maxDuration: 2 } });
    const p = provider([{ id: "x", name: "Xi", team: "red", points: 3, played_on: "2026-10-31", locked: false }]);
    const { result } = renderHook(() => useViewCalendarRange(lasting, { start: "2026-11-01", end: "2026-11-08" }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const reads = vi.mocked(p.getList).mock.calls.map((c) => c[1].filters);
    expect(reads).toContainEqual([
      { field: "played_on", operator: "gte", value: "2026-10-30" },
      { field: "played_on", operator: "lt", value: "2026-11-01" },
    ]);
    expect(result.current.rows.map((r) => r.id)).toEqual(["x"]);
  });

  it("reads the lookback latest start first, so the limit keeps the rows nearest the window", async () => {
    const lasting = defineView(players, { calendar: { field: "played_on", durationField: "points", durationUnit: "days", maxDuration: 2 } });
    const p = provider();
    const { result } = renderHook(() => useViewCalendarRange(lasting, { start: "2026-11-01", end: "2026-11-08" }, { limit: 500 }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const lookback = vi.mocked(p.getList).mock.calls.map((c) => c[1]).find((params) => params.filters?.some((f) => f.operator === "gte" && f.value === "2026-10-30"))!;
    expect(lookback.sort).toEqual({ field: "played_on", order: "desc" });
    expect(lookback.pagination).toEqual({ page: 1, perPage: 500 });
  });

  it("with an end column, reads only lookback rows with no end of their own, and doesn't warn without maxDuration", async () => {
    type Slot = { id: string; starts_at: string; ends_at: string | null; minutes: number };
    const slots = defineResource<Slot>()({
      name: "slots",
      key: "id",
      fields: [
        { name: "id", type: "string" },
        { name: "starts_at", type: "datetime", dbType: "timestamptz" },
        { name: "ends_at", type: "datetime", dbType: "timestamptz", nullable: true },
        { name: "minutes", type: "number" },
      ],
    });
    const p = provider();
    const ended = defineView(slots, { calendar: { field: "starts_at", endField: "ends_at", durationField: "minutes", maxDuration: 180 } });
    const { result } = renderHook(() => useViewCalendarRange(ended, { start: "2026-11-01", end: "2026-11-08" }, { timeZone: "UTC" }), { wrapper: wrap(p) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const reads = vi.mocked(p.getList).mock.calls.map((c) => c[1].filters ?? []);
    expect(reads).toContainEqual([
      { field: "starts_at", operator: "gte", value: "2026-10-31T21:00:00.000Z" },
      { field: "starts_at", operator: "lt", value: "2026-11-01T00:00:00.000Z" },
      { field: "ends_at", operator: "is_null" },
    ]);
    // A zoned timestamp looks back by elapsed time: across spring forward (New York, 8 March 2026,
    // a 23-hour day), 24 hours before the 9 March window is 04:00 UTC on the 8th, not that day's midnight.
    const dst = provider();
    const daylong = defineView(slots, { calendar: { field: "starts_at", durationField: "minutes", durationUnit: "hours", maxDuration: 24 } });
    const spring = renderHook(() => useViewCalendarRange(daylong, { start: "2026-03-09", end: "2026-03-10" }, { timeZone: "America/New_York" }), { wrapper: wrap(dst) });
    await waitFor(() => expect(spring.result.current.loading).toBe(false));
    expect(vi.mocked(dst.getList).mock.calls.map((c) => c[1].filters ?? [])).toContainEqual([
      { field: "starts_at", operator: "gte", value: "2026-03-08T04:00:00.000Z" },
      { field: "starts_at", operator: "lt", value: "2026-03-09T04:00:00.000Z" },
    ]);
    // Without maxDuration, an end column already reads the rows from before the window: no warning.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const quiet = defineView(slots, { calendar: { field: "starts_at", endField: "ends_at", durationField: "minutes" } });
    renderHook(() => useViewCalendarRange(quiet, { start: "2026-11-01", end: "2026-11-08" }, { timeZone: "UTC" }), { wrapper: wrap(provider()) });
    expect(warn.mock.calls.some((c) => String(c[0]).includes("maxDuration"))).toBe(false);
  });

  it("refuses a maxDuration that isn't a positive number or has no durationField", () => {
    expect(() => defineView(players, { calendar: { field: "played_on", maxDuration: 2 } })).toThrow(/maxDuration needs a durationField/);
    expect(() => defineView(players, { calendar: { field: "played_on", durationField: "points", maxDuration: -1 } })).toThrow(/maxDuration is a number above 0/);
  });
});

describe("<CustomView>", () => {
  it("draws loading, then hands the rows and their groups to the app", async () => {
    render(
      <CustomView view={view}>
        {({ rows, groups, status }) => (
          <ol data-slot="app-leaderboard" data-status={status}>
            {groups().map((g) => (
              <li key={g.key}>
                {g.label}: {g.rows.map((r) => r.name).join(", ")}
              </li>
            ))}
            <li>{rows.length} players</li>
          </ol>
        )}
      </CustomView>,
      { wrapper: wrap(provider()) },
    );
    expect(document.querySelector('[data-slot="custom-view"]')?.getAttribute("data-state")).toBe("loading");
    expect(screen.getByTestId("custom-view-loading").getAttribute("data-slot")).toBe("custom-view-loading");
    await waitFor(() => expect(screen.getByText("Blue: Bo")).toBeTruthy());
    expect(screen.getByText("Red: Ada, Cy")).toBeTruthy();
    const root = document.querySelector('[data-slot="custom-view"]')!;
    expect(root.getAttribute("data-state")).toBe("ready");
    expect(root.getAttribute("data-view-type")).toBe("list");
  });

  it("draws the view's empty words, or hands an empty view to the app with empty={false}", async () => {
    const { unmount } = render(<CustomView view={view}>{() => <p>rows</p>}</CustomView>, { wrapper: wrap(provider([])) });
    await waitFor(() => expect(screen.getByText("No players yet")).toBeTruthy());
    expect(screen.getByText("Add the first one.")).toBeTruthy();
    expect(screen.getByTestId("custom-view-empty").getAttribute("data-slot")).toBe("custom-view-empty");
    unmount();
    render(
      <CustomView view={view} empty={false}>
        {({ status }) => <p>drawn while {status}</p>}
      </CustomView>,
      { wrapper: wrap(provider([])) },
    );
    await waitFor(() => expect(screen.getByText("drawn while empty")).toBeTruthy());
  });

  it("draws an error with a retry, or the screen's own", async () => {
    const p = provider(ROWS, true);
    render(<CustomView view={view}>{() => <p>rows</p>}</CustomView>, { wrapper: wrap(p) });
    await waitFor(() => expect(screen.getByText("The server is down.")).toBeTruthy());
    expect(screen.getByTestId("custom-view-error").getAttribute("data-slot")).toBe("custom-view-error");
    const calls = vi.mocked(p.getList).mock.calls.length;
    fireEvent.click(screen.getByTestId("custom-view-retry"));
    await waitFor(() => expect(vi.mocked(p.getList).mock.calls.length).toBeGreaterThan(calls));
  });

  it("serves board and calendar data with the same states", async () => {
    render(
      <>
        <CustomView view={view} type="board" testID="board">
          {(state) => (state.type === "board" ? <p>{state.board.columns.map((c) => `${c.label}=${c.items.length}`).join(" ")}</p> : null)}
        </CustomView>
        <CustomView view={view} type="calendar" range={{ start: "2026-11-09", end: "2026-11-16" }} testID="calendar">
          {(state) => (state.type === "calendar" ? <p>week of {state.rows.map((r) => r.name).join(", ")}</p> : null)}
        </CustomView>
      </>,
      { wrapper: wrap(provider()) },
    );
    await waitFor(() => expect(screen.getByText("Red=2 Blue=1 No value=0")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("week of Bo")).toBeTruthy());
    expect(screen.getByTestId("board").getAttribute("data-view-type")).toBe("board");
  });
});
