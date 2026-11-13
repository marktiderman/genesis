// @feat:view-filters
/**
 * ADR 0017: what a view declares for its lists. Filters and segments as provider filters (and
 * the URL's allow-list), bulk actions, view types, totals, tone, export and column hints, and
 * saved views that apply as far as they still fit.
 */
import { describe, expect, it } from "vitest";

import {
  applicableListState,
  createLocalSavedViewStore,
  defineView,
  groupTotals,
  isFilterSet,
  listUrlParams,
  readListUrl,
  ViewDefinitionError,
} from "../resource-view";
import { createMemoryStorageAdapter } from "../storage";
import { defineResource } from "../schema/types";

type Task = { id: string; title: string; status: "todo" | "doing" | "done"; owner_id: string | null; due_on: string | null; hours: number | null; urgent: boolean; notes: string | null };

const tasks = defineResource<Task>()({
  name: "public.tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "status", type: "string", enumValues: ["todo", "doing", "done"] },
    { name: "owner_id", type: "string", nullable: true },
    { name: "due_on", type: "datetime", dbType: "date", nullable: true },
    { name: "hours", type: "number", nullable: true },
    { name: "urgent", type: "boolean" },
    { name: "notes", type: "string", nullable: true },
  ],
});

const view = defineView(tasks, {
  fields: {
    status: { labels: { todo: "To do" }, tones: { done: "success" } },
    hours: { emphasis: "secondary", sortable: false, hideBelow: "md", width: 90 },
  },
  filters: [{ field: "status" }, { field: "due_on" }, { field: "hours" }, { field: "urgent" }, { field: "notes" }],
  segments: [
    { id: "open", label: "Open", where: { status: ["todo", "doing"] }, count: true },
    { id: "mine", label: "Mine", where: (viewer) => ({ owner_id: viewer.id }) },
    { id: "all", label: "All" },
  ],
  actions: [
    { name: "complete", label: "Mark done", bulk: true, can: (t) => (t.status === "done" ? "It's already done." : true) },
    { name: "archive", label: "Archive", destructive: true, bulk: { confirm: "Archive {count} tasks?", matching: true, run: () => undefined } },
    { name: "share", label: "Share" },
  ],
  totals: { hours: "sum" },
  rowTone: (t) => (t.urgent ? "danger" : undefined),
  export: { columns: ["title", "status"], filename: "my tasks" },
  calendar: { field: "due_on" },
});

describe("filters", () => {
  it("resolves each declared filter's kind, words and choices", () => {
    expect(view.filters().map((f) => [f.field, f.kind, f.input ?? null])).toEqual([
      ["status", "choice", null],
      ["due_on", "range", "date"],
      ["hours", "range", "number"],
      ["urgent", "choice", null],
      ["notes", "text", null],
    ]);
    expect(view.filters()[0]!.options).toEqual([
      { value: "todo", label: "To do" },
      { value: "doing", label: "Doing" },
      { value: "done", label: "Done", tone: "success" },
    ]);
    expect(view.filters()[3]!.options.map((o) => o.label)).toEqual(["Yes", "No"]);
  });

  it("turns values into provider filters, dropping what a filter doesn't take", () => {
    expect(
      view.filterParams({
        status: ["doing", "nope"],
        due_on: { gte: "2026-01-01", lte: "not a day" },
        hours: { lte: "8" },
        urgent: ["true"],
        notes: "  call back ",
        id: "x" as never,
      }),
    ).toEqual([
      { field: "status", operator: "eq", value: "doing" },
      { field: "due_on", operator: "gte", value: "2026-01-01" },
      { field: "hours", operator: "lte", value: 8 },
      { field: "urgent", operator: "eq", value: true },
      { field: "notes", operator: "contains", value: "call back" },
    ]);
    expect(view.filterParams({ status: ["todo", "done"] })).toEqual([{ field: "status", operator: "in", value: ["todo", "done"] }]);
    expect(view.filterParams(null)).toEqual([]);
  });

  it("refuses a filter on a field that isn't there or can't be one", () => {
    expect(() => defineView(tasks, { filters: [{ field: "nope" as "title" }] })).toThrow(/filters\[0\].field names "nope"/);
    expect(() => defineView(tasks, { filters: [{ field: "title", kind: "range" }] })).toThrow(/isn't a date or a number/);
    expect(() => defineView(tasks, { filters: [{ field: "title", kind: "choice" }] })).toThrow(/name them in options/);
    expect(() => defineView(tasks, { filters: [{ field: "status", options: ["late"] }] })).toThrow(/"late", which isn't a value/);
  });
});

describe("segments", () => {
  it("gives each segment's rows as provider filters, for the viewer", () => {
    expect(view.segments().map((s) => [s.id, s.count])).toEqual([
      ["open", true],
      ["mine", false],
      ["all", false],
    ]);
    expect(view.segmentFilters("open")).toEqual([{ field: "status", operator: "in", value: ["todo", "doing"] }]);
    expect(view.segmentFilters("mine", { id: "u1", scope: {} })).toEqual([{ field: "owner_id", operator: "eq", value: "u1" }]);
    expect(view.segmentFilters("all")).toEqual([]);
    expect(() => view.segmentFilters("late")).toThrow(ViewDefinitionError);
    // A function source's arguments: equality filters its `take` reads, not fields.
    expect(defineView(tasks, { segments: [{ id: "mine", label: "Mine", args: { queue: "mine" } }] }).segmentFilters("mine")).toEqual([{ field: "queue", operator: "eq", value: "mine" }]);
  });

  it("refuses an id the URL can't carry, a repeat and an unknown field", () => {
    expect(() => defineView(tasks, { segments: [{ id: "Open Now", label: "Open" }] })).toThrow(/segments\[0\].id/);
    expect(() => defineView(tasks, { segments: [{ id: "a", label: "A" }, { id: "a", label: "B" }] })).toThrow(/"a" twice/);
    expect(() => defineView(tasks, { segments: [{ id: "a", label: "A", where: { nope: 1 } as never }] })).toThrow(/names "nope"/);
  });
});

describe("the URL", () => {
  it("writes the segment and declared filters, and reads back only what the view declares", () => {
    const params = listUrlParams(view, { segment: "mine", filters: { status: ["todo", "doing"], due_on: { gte: "2026-01-01" }, notes: "" } }, "open");
    expect(params).toEqual({
      seg: "mine",
      "f.status": "todo,doing",
      "f.due_on": "2026-01-01..",
      "f.hours": null,
      "f.urgent": null,
      "f.notes": null,
    });
    const url = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null)), "f.id": "x", seg: "mine" } as Record<string, string>);
    expect(readListUrl(view, (k) => url.get(k))).toEqual({ segment: "mine", filters: { status: ["todo", "doing"], due_on: { gte: "2026-01-01" } } });
    expect(readListUrl(view, (k) => (k === "seg" ? "late" : null))).toEqual({});
  });
});

describe("actions in lists", () => {
  it("says which actions run on many rows, with their words", () => {
    expect(view.actions().map((a) => [a.name, a.bulk ?? null])).toEqual([
      ["complete", { label: "Mark done", matching: false, batch: false }],
      ["archive", { label: "Archive", confirm: "Archive {count} tasks?", matching: true, batch: true }],
      ["share", null],
    ]);
    expect(() => defineView(tasks, { actions: [{ name: "x", label: "X", bulk: { matching: true } }] })).toThrow(/matching needs a run/);
  });
});

describe("types, totals, tone, export and column hints", () => {
  it("lists the view types a person may switch between", () => {
    expect(view.types()).toEqual(["table", "list", "grid", "calendar"]);
    expect(defineView(tasks, { types: ["table", "timeline"] }).types()).toEqual(["table", "timeline"]);
    expect(() => defineView(tasks, { types: ["board"] })).toThrow(/needs a board block/);
  });

  it("totals the rows, and checks the field can be totalled", () => {
    const rows = [{ hours: 2 }, { hours: 3.5 }, { hours: null }] as Task[];
    expect(groupTotals(view, rows)).toEqual({ hours: 5.5 });
    expect(groupTotals(view, [])).toEqual({ hours: null });
    expect(() => defineView(tasks, { totals: { title: "sum" } })).toThrow(/isn't a number/);
  });

  it("gives a row's tone, the export plan and each column's hints", () => {
    expect(view.rowTone({ urgent: true } as Task)).toBe("danger");
    expect(view.rowTone({ urgent: false } as Task)).toBeUndefined();
    const plan = view.exportPlan()!;
    expect([plan.columns.map((c) => c.key), plan.filename, plan.maxRows, plan.raw]).toEqual([["title", "status"], "my tasks", 10_000, false]);
    expect(defineView(tasks).exportPlan()).toBeUndefined();
    const hours = view.column("hours")!;
    expect([hours.emphasis, hours.sortable, hours.hideBelow, hours.width]).toEqual(["secondary", false, "md", 90]);
    expect(view.column("title")!.emphasis).toBe("title");
    expect(() => defineView(tasks, { fields: { title: { emphasis: "title" }, notes: { emphasis: "title" } } })).toThrow(/only one field is the row's title/);
  });
});

describe("saved views", () => {
  it("keeps personal views and the current state on the device", async () => {
    const store = createLocalSavedViewStore({ storage: createMemoryStorageAdapter() });
    const saved = await store.save({ name: "Mine", scope: "personal", resource: "public.tasks", version: 1, state: { segment: "mine" } });
    expect((await store.list("public.tasks")).map((v) => v.name)).toEqual(["Mine"]);
    await store.writeCurrent!("public.tasks", { type: "calendar" });
    expect(await store.readCurrent!("public.tasks")).toEqual({ type: "calendar" });
    await store.remove(saved.id, "public.tasks");
    expect(await store.list("public.tasks")).toEqual([]);
  });

  it("applies an older saved state as far as it still fits", () => {
    expect(
      applicableListState(view, {
        segment: "gone",
        filters: { status: ["todo"], removed: ["x"], notes: "" },
        sort: { field: "hours", order: "desc" },
        columns: "nope",
        type: "board",
        groupBy: "status",
      }),
    ).toEqual({ filters: { status: ["todo"] }, sort: { field: "hours", order: "desc" }, groupBy: "status" });
    expect(applicableListState(view, { type: "calendar", groupBy: null })).toEqual({ type: "calendar", groupBy: null });
  });
});

describe("the inbox block", () => {
  const inboxView = defineView(tasks, {
    fields: { status: { tones: { done: "success" } } },
    inbox: { preview: "notes", time: "due_on", from: "owner_id", unread: "urgent", badge: "status" },
    actions: [{ name: "done", label: "Done" }, { name: "markRead", label: "Mark read" }],
  });

  it("draws a row as an inbox does, and offers the inbox type", () => {
    const row = { id: "t1", title: "Call back", status: "done", owner_id: "Ada", due_on: "2026-11-12", hours: 1, urgent: true, notes: "About the invoice" } as Task;
    expect(inboxView.inboxRow(row)).toEqual({
      id: "t1",
      title: "Call back",
      unread: true,
      preview: "About the invoice",
      time: "2026-11-12",
      from: "Ada",
      badge: { label: "Done", tone: "success" },
    });
    expect(inboxView.types()).toContain("inbox");
    expect(inboxView.inboxActions()).toEqual({ done: "done", markRead: "markRead" });
    // Without a block: the summary's title, read.
    expect(defineView(tasks).inboxRow(row)).toEqual({ id: "t1", title: "Call back", unread: false });
  });

  it("names a field that isn't there, an unread that isn't yes/no and an action the view lacks", () => {
    expect(() => defineView(tasks, { inbox: { preview: "nope" as "title" } })).toThrow(/inbox.preview names "nope"/);
    expect(() => defineView(tasks, { inbox: { unread: "title" } })).toThrow(/isn't a yes\/no field/);
    expect(() => defineView(tasks, { inbox: { doneAction: "solve" } })).toThrow(/isn't one of the view's actions/);
    expect(() => defineView(tasks, { types: ["table", "inbox"] })).toThrow(/needs an inbox block/);
    expect(defineView(tasks, { inbox: { unread: (t) => t.urgent }, types: ["table", "inbox"] }).types()).toEqual(["table", "inbox"]);
  });
});

describe("review fixes", () => {
  const events = defineResource<{ id: string; title: string; starts_at: string; done_on: string }>()({
    name: "public.events",
    key: "id",
    labelField: "title",
    fields: [
      { name: "id", type: "string" },
      { name: "title", type: "string" },
      { name: "starts_at", type: "datetime", dbType: "timestamptz" },
      { name: "done_on", type: "datetime", dbType: "date" },
    ],
  });

  it("reads days on a timestamp column as the viewer's whole days, and a time without an offset on their clock", () => {
    const shown = defineView(events, { fields: { starts_at: { display: "date" } }, filters: [{ field: "starts_at" }, { field: "done_on" }] });
    expect(shown.filterParams({ starts_at: { gte: "2024-01-01", lte: "2024-01-31" } }, "America/New_York")).toEqual([
      { field: "starts_at", operator: "gte", value: "2024-01-01T05:00:00.000Z" },
      { field: "starts_at", operator: "lt", value: "2024-02-01T05:00:00.000Z" },
    ]);
    // A date column keeps its days as they are.
    expect(shown.filterParams({ done_on: { lte: "2024-01-31" } }, "America/New_York")).toEqual([{ field: "done_on", operator: "lte", value: "2024-01-31" }]);
    const timed = defineView(events, { filters: [{ field: "starts_at" }] });
    expect(timed.filterParams({ starts_at: { gte: "2024-07-01T10:00", lte: "2024-07-01T12:00Z" } }, "Europe/Paris")).toEqual([
      { field: "starts_at", operator: "gte", value: "2024-07-01T08:00:00.000Z" },
      { field: "starts_at", operator: "lte", value: "2024-07-01T12:00Z" },
    ]);
  });

  it("drops malformed stored filter values instead of throwing", () => {
    expect(isFilterSet({ gte: 5 } as never)).toBe(false);
    expect(isFilterSet(null as never)).toBe(false);
    expect(isFilterSet([1, ""] as never)).toBe(false);
    expect(applicableListState(view, { filters: { status: { gte: 5 }, due_on: "x", hours: { gte: "1", lte: 3 }, urgent: null, notes: ["a"] } } as never)).toEqual({
      filters: { status: ["x"].filter(() => false).length ? {} : undefined, hours: { gte: "1" } },
    } as never);
  });

  it("keeps each viewer's device views apart", () => {
    const storage = createMemoryStorageAdapter();
    const device = createLocalSavedViewStore({ storage });
    device.forViewer!("u-1").save({ name: "Mine", scope: "personal", resource: "public.tasks", version: 1, state: { search: "private words" } });
    expect(device.forViewer!("u-1").list("public.tasks")).toHaveLength(1);
    expect(device.forViewer!("u-2").list("public.tasks")).toEqual([]);
    expect(device.forViewer!(null).list("public.tasks")).toEqual([]);
    expect(device.list("public.tasks")).toEqual([]);
  });
});
