/**
 * DataStudio P3: the board (one column per value, paged per column, a move
 * is a version-checked update), the calendar (a month range per request),
 * row actions with a confirmation, and comments.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseRecord, DataProvider, FilterParam, ListParams } from "@marktiderman/genesis-core/provider";
import type { AuditEntry, RecordComment, ResourceSchema } from "@marktiderman/genesis-core/schema";
import { DataStudio } from "../DataStudio";
import { useMemoryRouter, type StudioLocation } from "../router";
import { localDay, monthBounds } from "../views/fields";

type Row = Record<string, unknown>;

const CLIENTS: ResourceSchema = {
  name: "public.clients",
  label: "Clients",
  key: "id",
  labelField: "name",
  version: { field: "updated_at", kind: "timestamp" },
  access: { read: true, update: true, create: false, delete: false, history: true, comment: true },
  actions: [
    { name: "complete", label: "Mark done", confirm: "Mark this client done?" },
    { name: "ping", label: "Ping" },
  ],
  fields: [
    { name: "id", type: "string", permissions: { read: true, update: false } },
    { name: "name", type: "string", permissions: { read: true, update: true } },
    { name: "status", type: "string", enumValues: ["active", "paused", "done"], permissions: { read: true, update: true } },
    { name: "starts_on", type: "datetime", dbType: "date", widget: "date", label: "Starts on", nullable: true, permissions: { read: true, update: true } },
    { name: "updated_at", type: "datetime", dbType: "timestamp with time zone", permissions: { read: true, update: false } },
  ],
};

function eqValue(filters: FilterParam[] | undefined, field: string) {
  const f = filters?.find((x) => x.field === field && x.operator === "eq");
  return f && "value" in f ? f.value : undefined;
}

function makeProvider(count = 3) {
  let n = 1;
  const db: Row[] = Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    name: `Client ${i + 1}`,
    status: i === 1 ? "paused" : "active",
    starts_on: `2026-10-${String(5 + i).padStart(2, "0")}`,
    updated_at: "v1",
  }));
  const calls: Array<{ op: string; args: any }> = [];
  const comments: RecordComment[] = [];
  const provider = {
    async listResources() {
      return [{ name: CLIENTS.name, label: "Clients", access: CLIENTS.access }];
    },
    async describe() {
      return CLIENTS;
    },
    async capabilities() {
      return { search: true, sort: true, filterOperators: ["eq", "gte", "lt", "is_null"], bulkWrites: true, versionedWrites: true, compositeKeys: true, actions: true, comments: true };
    },
    async getList<T extends BaseRecord>(_r: string, params: ListParams) {
      calls.push({ op: "getList", args: params });
      const { page = 1, perPage = 25 } = params.pagination ?? {};
      const status = eqValue(params.filters, "status");
      const gte = params.filters?.find((f) => f.operator === "gte");
      const lt = params.filters?.find((f) => f.operator === "lt");
      const rows = db.filter(
        (r) =>
          (status === undefined || r.status === status) &&
          (!gte || ("value" in gte && String(r[gte.field]) >= String(gte.value))) &&
          (!lt || ("value" in lt && String(r[lt.field]) < String(lt.value))),
      );
      return { data: rows.slice((page - 1) * perPage, page * perPage).map((r) => ({ ...r })) as unknown as T[], total: rows.length };
    },
    async getOne<T extends BaseRecord>(_r: string, { id }: { id: unknown }) {
      return { data: { ...db.find((r) => r.id === id)! } as unknown as T };
    },
    async getMany() {
      return { data: [] };
    },
    async update<T extends BaseRecord>(_r: string, params: { id: unknown; data: Row; expectedVersion?: string | null }) {
      calls.push({ op: "update", args: params });
      const row = db.find((r) => r.id === params.id)!;
      Object.assign(row, params.data, { updated_at: `v${++n}` });
      return { data: { ...row } as unknown as T };
    },
    async runAction(_r: string, params: { id: unknown; action: string; expectedVersion?: string | null }) {
      calls.push({ op: "runAction", args: params });
      const row = db.find((r) => r.id === params.id)!;
      if (row.status === "done") throw new Error("Not saved: Only an open client can be marked done.");
      if (params.action === "complete") Object.assign(row, { status: "done", updated_at: `v${++n}` });
      const audit: AuditEntry = { id: "a1", occurredAt: "t", actor: "me", resource: CLIENTS.name, key: { id: row.id }, action: "run", rowAction: params.action, before: {}, after: {} };
      return { data: { ...row }, audit };
    },
    async comments() {
      return [...comments];
    },
    async addComment(_r: string, params: { id: unknown; body: string }) {
      const c = { id: `m${comments.length + 1}`, author: "owner-a", body: params.body, createdAt: "2026-10-19 10:00:00+00" };
      comments.push(c);
      return c;
    },
    async history() {
      return [];
    },
    create: async () => {
      throw new Error("no");
    },
    deleteOne: async () => {
      throw new Error("no");
    },
  } as unknown as DataProvider;
  return { provider, db, calls };
}

function Harness({ provider, initial }: { provider: DataProvider; initial?: StudioLocation }) {
  const router = useMemoryRouter(initial);
  return (
    <>
      <DataStudio provider={provider} router={router} />
      <output data-testid="location">{JSON.stringify(router.location)}</output>
    </>
  );
}

beforeEach(() => localStorage.clear());

describe("DataStudio P3: board", () => {
  it("shows one column per value, each loaded on its own", async () => {
    const { provider, calls } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients", view: "kanban" }} />);
    const board = await screen.findByTestId("studio-kanban");
    const active = await within(board).findByRole("region", { name: "active" });
    await within(active).findByText("Client 1");
    expect(within(active).getByText("Client 3")).toBeTruthy();
    expect(within(within(board).getByRole("region", { name: "paused" })).getByText("Client 2")).toBeTruthy();
    const perColumn = calls.filter((c) => c.op === "getList" && eqValue(c.args.filters, "status") !== undefined);
    expect(perColumn.map((c) => eqValue(c.args.filters, "status")).sort()).toEqual(["active", "done", "paused"]);
    expect(perColumn.every((c) => c.args.pagination.perPage === 50)).toBe(true);
  });

  it("moves a card with a version-checked update of the column field", async () => {
    const { provider, calls } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients", view: "kanban" }} />);
    fireEvent.keyDown(await screen.findByRole("button", { name: "Move Client 1" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "done" }));
    await waitFor(() => expect(calls.some((c) => c.op === "update")).toBe(true));
    expect(calls.find((c) => c.op === "update")!.args).toEqual({ id: "c1", data: { status: "done" }, expectedVersion: "v1" });
    const done = await screen.findByRole("region", { name: "done" });
    await within(done).findByText("Client 1");
  });

  it("pages a long column with Load more", async () => {
    const { provider } = makeProvider(60);
    render(<Harness provider={provider} initial={{ resource: "public.clients", view: "kanban" }} />);
    const active = await screen.findByRole("region", { name: "active" });
    await within(active).findByText("Client 1");
    expect(within(active).getAllByTestId("studio-kanban-card")).toHaveLength(50);
    fireEvent.click(within(active).getByRole("button", { name: /Load more \(9 left\)/ }));
    await waitFor(() => expect(within(active).getAllByTestId("studio-kanban-card")).toHaveLength(59));
  });
});

describe("DataStudio P3: calendar", () => {
  it("asks for one month at a time and places rows on their day", async () => {
    const { provider, calls } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients", view: "calendar", month: "2026-10" }} />);
    const calendar = await screen.findByTestId("studio-calendar");
    await within(calendar).findByText("Client 1");
    const day = calendar.querySelector('[data-day="2026-10-06"]') as HTMLElement;
    expect(within(day).getByText("Client 2")).toBeTruthy();
    const request = calls.find((c) => c.op === "getList" && c.args.filters?.some((f: FilterParam) => f.operator === "gte"))!;
    expect(request.args.filters).toEqual([
      { field: "starts_on", operator: "gte", value: "2026-10-01" },
      { field: "starts_on", operator: "lt", value: "2026-11-01" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent!).month).toBe("2026-11"));
    fireEvent.click(await screen.findByRole("button", { name: "Previous month" }));
    fireEvent.click(await within(screen.getByTestId("studio-calendar")).findByText("Client 3"));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent!).record).toBe("c3"));
  });

  it("reads Postgres timestamps onto the viewer's day", () => {
    expect(localDay("2026-10-19", true)).toBe("2026-10-19");
    const local = new Date("2026-10-19T12:00:00.123Z");
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    expect(localDay("2026-10-19 12:00:00.123456+00", false)).toBe(expected);
    expect(localDay("not a date", false)).toBeNull();
    expect(monthBounds("2026-12", { name: "d", type: "datetime", dbType: "date" })).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
});

describe("DataStudio P3: row actions and comments", () => {
  it("asks before an action with a confirmation, then runs it at the row's version", async () => {
    const { provider, calls } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients", record: "c1" }} />);
    const panel = await screen.findByTestId("studio-record-panel");
    await within(panel).findByDisplayValue("Client 1");
    fireEvent.click(within(panel).getByTestId("studio-action-complete"));
    expect(calls.some((c) => c.op === "runAction")).toBe(false);
    fireEvent.click(await screen.findByTestId("studio-action-confirm"));
    await waitFor(() => expect(calls.find((c) => c.op === "runAction")?.args).toEqual({ id: "c1", action: "complete", expectedVersion: "v1" }));
    // Runs without a question when none is configured.
    fireEvent.click(await within(panel).findByTestId("studio-action-ping"));
    await waitFor(() => expect(calls.filter((c) => c.op === "runAction")).toHaveLength(2));
    expect(calls.filter((c) => c.op === "runAction")[1]!.args.expectedVersion).not.toBe("v1");
  });

  it("says which action didn't run, and why", async () => {
    const { provider, db } = makeProvider();
    db[0]!.status = "done";
    render(<Harness provider={provider} initial={{ resource: "public.clients", record: "c1" }} />);
    const panel = await screen.findByTestId("studio-record-panel");
    await within(panel).findByDisplayValue("Client 1");
    fireEvent.click(within(panel).getByTestId("studio-action-ping"));
    const alert = await within(panel).findByTestId("studio-action-error");
    expect(alert.textContent).toContain("Ping didn't run");
    expect(alert.textContent).toContain("Only an open client can be marked done. Nothing was changed.");
    expect(alert.textContent).not.toContain("Not saved");
  });

  it("labels fields from the contract", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients", record: "c1" }} />);
    const panel = await screen.findByTestId("studio-record-panel");
    expect(await within(panel).findByText("Starts on")).toBeTruthy();
  });

  it("lists and posts comments", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients", record: "c1" }} />);
    const panel = await screen.findByTestId("studio-record-panel");
    const tab = await within(panel).findByRole("tab", { name: "Comments" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const comments = await within(panel).findByTestId("studio-comments");
    await within(comments).findByText("No comments yet.");
    fireEvent.change(within(comments).getByRole("textbox", { name: "New comment" }), { target: { value: "Called today." } });
    fireEvent.click(within(comments).getByTestId("studio-comment-post"));
    await within(comments).findByText("Called today.");
    expect(within(comments).getByText("owner-a")).toBeTruthy();
  });
});
