/**
 * DataStudio P1: the record pop-up (form, related records, history),
 * adding and deleting rows, filters, multi-sort, grouping, link labels and
 * CSV export — against an in-memory provider with the handler's semantics.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseRecord, DataProvider, ListParams } from "@marktiderman/genesis-core/provider";
import { DataWriteError, type AuditEntry, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { DataStudio } from "../DataStudio";
import { useMemoryRouter, type StudioLocation, type StudioRouter } from "../router";

type Row = Record<string, unknown>;

const PROGRAMS: ResourceSchema = {
  name: "public.programs",
  label: "Programs",
  key: "id",
  labelField: "name",
  access: { read: true, update: false, create: false, delete: false, history: false },
  fields: [
    { name: "id", type: "number", permissions: { read: true, update: false } },
    { name: "name", type: "string", permissions: { read: true, update: false } },
  ],
};

const CLIENTS: ResourceSchema = {
  name: "public.clients",
  label: "Clients",
  key: "id",
  labelField: "name",
  version: { field: "updated_at", kind: "timestamp" },
  access: { read: true, update: true, create: true, delete: true, history: true },
  createFields: ["name", "status", "program_id"],
  relations: [
    { kind: "one", resource: "public.programs", field: "program_id" },
    { kind: "many", resource: "public.notes", field: "client_id" },
  ],
  fields: [
    { name: "id", type: "string", permissions: { read: true, update: false, reason: "Key fields can't be edited." } },
    { name: "name", type: "string", nullable: false, permissions: { read: true, update: true } },
    { name: "status", type: "string", enumValues: ["active", "paused"], nullable: false, hasDefault: true, permissions: { read: true, update: true } },
    { name: "program_id", type: "number", nullable: true, widget: "relation", references: { resource: "public.programs", field: "id" }, permissions: { read: true, update: true } },
    { name: "updated_at", type: "datetime", permissions: { read: true, update: false, reason: "The database sets the version field." } },
  ],
};

const NOTES: ResourceSchema = {
  name: "public.notes",
  label: "Notes",
  key: "id",
  labelField: "body",
  access: { read: true, update: false },
  fields: [
    { name: "id", type: "number", permissions: { read: true, update: false } },
    { name: "client_id", type: "string", permissions: { read: true, update: false } },
    { name: "body", type: "string", permissions: { read: true, update: false } },
  ],
};

function makeProvider() {
  let n = 1;
  const db: Record<string, Row[]> = {
    "public.programs": [
      { id: 1, name: "Leadership" },
      { id: 2, name: "Wellbeing" },
    ],
    "public.clients": [
      { id: "c1", name: "Ana Ruiz", status: "active", program_id: 1, updated_at: "v1" },
      { id: "c2", name: "Ben Ode", status: "paused", program_id: null, updated_at: "v1" },
      { id: "c3", name: "Cy Lam", status: "active", program_id: 2, updated_at: "v1" },
    ],
    "public.notes": [{ id: 10, client_id: "c1", body: "Kickoff call" }],
  };
  const lists: ListParams[] = [];
  const calls: Array<{ op: string; args: unknown }> = [];
  const schemas: Record<string, ResourceSchema> = { "public.clients": CLIENTS, "public.programs": PROGRAMS, "public.notes": NOTES };
  const history: AuditEntry[] = [];
  const audit = (action: AuditEntry["action"], key: Row, before: Row | null, after: Row | null): AuditEntry => {
    const entry = { id: `audit-${n++}`, occurredAt: "2026-10-19 10:00:00+00", actor: "owner-a", resource: "public.clients", key, action, before, after };
    history.unshift(entry);
    return entry;
  };
  const matches = (row: Row, params: ListParams) =>
    (params.filters ?? []).every((f) => {
      const v = row[f.field];
      if (f.operator === "eq") return String(v) === String(f.value);
      if (f.operator === "in") return f.value.map(String).includes(String(v));
      if (f.operator === "contains") return String(v ?? "").toLowerCase().includes(String(f.value).toLowerCase());
      if (f.operator === "is_null") return v == null;
      return true;
    });
  const provider: DataProvider = {
    async listResources() {
      return Object.values(schemas).map(({ name, label, access }) => ({ name, label, access }));
    },
    async describe(resource) {
      return schemas[resource]!;
    },
    async capabilities() {
      return { search: true, sort: true, filterOperators: ["eq", "contains", "in", "is_null"], bulkWrites: false, versionedWrites: true, compositeKeys: true, multiSort: true, create: true, delete: true, history: true };
    },
    async getList<T extends BaseRecord>(resource: string, params: ListParams) {
      lists.push({ ...params, ...({ resource } as object) });
      let rows = db[resource]!.filter((r) => matches(r, params));
      for (const s of [...(params.sorts ?? [])].reverse()) {
        rows = [...rows].sort((a, b) => String(a[s.field]).localeCompare(String(b[s.field])) * (s.order === "desc" ? -1 : 1));
      }
      const { page = 1, perPage = 25 } = params.pagination ?? {};
      return { data: rows.slice((page - 1) * perPage, page * perPage).map((r) => ({ ...r })) as unknown as T[], total: rows.length };
    },
    async getOne<T extends BaseRecord>(resource: string, params: { id: unknown }) {
      const row = db[resource]!.find((r) => String(r.id) === String(params.id));
      if (!row) throw new DataWriteError("gone", "This row was deleted, or you can no longer see it.");
      return { data: { ...row } as unknown as T };
    },
    async getMany() {
      return { data: [] };
    },
    async update<T extends BaseRecord>(resource: string, params: { id: unknown; data: Row; expectedVersion?: string | null }) {
      calls.push({ op: "update", args: params });
      const row = db[resource]!.find((r) => r.id === params.id)!;
      if (params.expectedVersion !== row.updated_at) {
        throw new DataWriteError("conflict", "Not saved: someone else changed this row.", { current: { ...row }, currentVersion: String(row.updated_at) });
      }
      const before = Object.fromEntries(Object.keys(params.data).map((k) => [k, row[k]]));
      Object.assign(row, params.data, { updated_at: `v${n++}` });
      return { data: { ...row } as unknown as T, audit: audit("update", { id: row.id }, before, params.data) };
    },
    async create<T extends BaseRecord>(resource: string, params: { data: Partial<T> }) {
      calls.push({ op: "create", args: params });
      const row = { id: `c${n++}`, status: "active", program_id: null, updated_at: "v1", ...(params.data as Row) };
      db[resource]!.push(row);
      return { data: { ...row } as unknown as T, audit: audit("create", { id: row.id }, null, row) };
    },
    async deleteOne(resource: string, params: { id: unknown; expectedVersion?: string | null }) {
      calls.push({ op: "delete", args: params });
      db[resource] = db[resource]!.filter((r) => r.id !== params.id);
      return { data: { id: params.id as string }, audit: audit("delete", { id: params.id }, {}, null) };
    },
    async history() {
      return history;
    },
  } as DataProvider;
  return { provider, db, lists, calls, history };
}

let router: StudioRouter | null = null;
function Harness({ provider, initial }: { provider: DataProvider; initial?: StudioLocation }) {
  router = useMemoryRouter(initial);
  return <DataStudio provider={provider} router={router} />;
}

beforeEach(() => {
  localStorage.clear();
  router = null;
});

async function openClients(provider: DataProvider, initial: StudioLocation = {}) {
  render(<Harness provider={provider} initial={{ resource: "public.clients", ...initial }} />);
  await screen.findByTestId("studio-sheet");
  await waitFor(() => expect(screen.getAllByText(/Ana Ruiz|Cy Lam/).length).toBeGreaterThan(0));
}

describe("DataStudio P1", () => {
  it("shows a link's label from the linked table, with one query per page", async () => {
    const { provider, lists } = makeProvider();
    await openClients(provider);
    expect(await screen.findByText("Leadership")).toBeTruthy();
    expect(screen.getByText("Wellbeing")).toBeTruthy();
    const labelQueries = lists.filter((l) => (l as { resource?: string }).resource === "public.programs");
    expect(labelQueries).toHaveLength(1);
    expect(labelQueries[0]!.filters).toEqual([{ field: "id", operator: "in", value: ["1", "2"] }]);
  });

  it("opens a record in a panel, with a link in the URL", async () => {
    const { provider } = makeProvider();
    await openClients(provider);
    fireEvent.click(screen.getAllByTestId("studio-open-record")[0]!);
    const panel = await screen.findByTestId("studio-record-panel");
    expect(await within(panel).findByText("Ana Ruiz")).toBeTruthy();
    expect(router!.location.record).toBe("c1");
  });

  it("saves several fields from the record form at the row's version, with validation", async () => {
    const { provider, calls } = makeProvider();
    await openClients(provider, { record: "c2" });
    const panel = await screen.findByTestId("studio-record-panel");
    const name = await within(panel).findByLabelText(/^name/);
    fireEvent.change(name, { target: { value: "" } });
    await act(async () => {
      fireEvent.click(within(panel).getByTestId("studio-edit-submit"));
    });
    expect(within(panel).getByText("Required.")).toBeTruthy();
    expect(calls).toHaveLength(0);

    fireEvent.change(name, { target: { value: "Ben Odey" } });
    await act(async () => {
      fireEvent.click(within(panel).getByTestId("studio-edit-submit"));
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ op: "update", args: { id: "c2", data: { name: "Ben Odey" }, expectedVersion: "v1" } });
    expect(await screen.findByTestId("studio-activity-saved")).toBeTruthy();
  });

  it("shows a conflict in the panel and loads the row as it is now", async () => {
    const { provider, db } = makeProvider();
    await openClients(provider, { record: "c2" });
    const panel = await screen.findByTestId("studio-record-panel");
    const name = await within(panel).findByLabelText(/^name/);
    Object.assign(db["public.clients"]![1]!, { name: "Changed elsewhere", updated_at: "v9" });
    fireEvent.change(name, { target: { value: "Mine" } });
    await act(async () => {
      fireEvent.click(within(panel).getByTestId("studio-edit-submit"));
    });
    expect((await within(panel).findByTestId("studio-record-conflict")).textContent).toMatch(/someone else changed this row/);
    await waitFor(() => expect((within(panel).getByLabelText(/^name/) as HTMLInputElement).value).toBe("Changed elsewhere"));
  });

  it("lists related records and follows a link to one", async () => {
    const { provider } = makeProvider();
    await openClients(provider, { record: "c1" });
    const panel = await screen.findByTestId("studio-record-panel");
    fireEvent.mouseDown(within(panel).getByRole("tab", { name: /Related/ }));
    fireEvent.click(within(panel).getByRole("tab", { name: /Related/ }));
    expect(await within(panel).findByText("Kickoff call")).toBeTruthy();
    expect(await within(panel).findByText("Leadership")).toBeTruthy();
    fireEvent.click(within(panel).getByText("Kickoff call"));
    expect(router!.location).toMatchObject({ resource: "public.notes", record: "10" });
  });

  it("adds a row from a form of the fields the user may set", async () => {
    const { provider, calls } = makeProvider();
    await openClients(provider);
    fireEvent.click(screen.getByTestId("studio-new-row"));
    const dialog = await screen.findByTestId("studio-create-dialog");
    expect(within(dialog).queryByLabelText(/^id/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^name/), { target: { value: "Dee Park" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("studio-create-submit"));
    });
    await waitFor(() => expect(calls.find((c) => c.op === "create")).toBeTruthy());
    expect(calls.find((c) => c.op === "create")!.args).toEqual({ data: { name: "Dee Park" } });
    expect(await screen.findByTestId("studio-record-panel")).toBeTruthy();
  });

  it("keeps what the user typed in the new-row form when the sheet re-renders", async () => {
    const { provider } = makeProvider();
    await openClients(provider);
    fireEvent.click(screen.getByTestId("studio-new-row"));
    const dialog = await screen.findByTestId("studio-create-dialog");
    fireEvent.change(within(dialog).getByLabelText(/^name/), { target: { value: "Half typed" } });
    // Anything that re-renders the sheet (a refetch, a link label arriving,
    // an activity entry) must leave the form alone; a URL update does it here.
    await act(async () => router!.navigate({ ...router!.location }));
    await act(async () => {});
    expect((within(dialog).getByLabelText(/^name/) as HTMLInputElement).value).toBe("Half typed");
  });

  it("deletes a row after confirming, at its version", async () => {
    const { provider, calls, db } = makeProvider();
    await openClients(provider, { record: "c3" });
    const panel = await screen.findByTestId("studio-record-panel");
    await within(panel).findByLabelText(/^name/);
    fireEvent.click(within(panel).getByTestId("studio-delete"));
    await act(async () => {
      fireEvent.click(await screen.findByTestId("studio-delete-confirm"));
    });
    await waitFor(() => expect(calls.find((c) => c.op === "delete")).toBeTruthy());
    expect(calls.find((c) => c.op === "delete")!.args).toEqual({ id: "c3", expectedVersion: "v1" });
    expect(db["public.clients"]!.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(router!.location.record).toBeUndefined();
  });

  it("shows a row's history", async () => {
    const { provider } = makeProvider();
    await openClients(provider, { record: "c2" });
    const panel = await screen.findByTestId("studio-record-panel");
    const name = await within(panel).findByLabelText(/^name/);
    fireEvent.change(name, { target: { value: "Ben O." } });
    await act(async () => {
      fireEvent.click(within(panel).getByTestId("studio-edit-submit"));
    });
    fireEvent.mouseDown(within(panel).getByRole("tab", { name: "History" }));
    fireEvent.click(within(panel).getByRole("tab", { name: "History" }));
    const history = await within(panel).findByTestId("studio-history");
    expect(history.textContent).toMatch(/name: Ben Ode → Ben O\./);
  });

  it("filters and sorts by several fields on the server, from the URL", async () => {
    const { provider, lists } = makeProvider();
    await openClients(provider, {
      filters: JSON.stringify([["status", "eq", "active"]]),
      sort: "status:asc,name:desc",
    });
    expect(screen.queryByText("Ben Ode")).toBeNull();
    const last = lists.filter((l) => !(l as { resource?: string }).resource || (l as { resource?: string }).resource === "public.clients").at(-1)!;
    expect(last.filters).toEqual([{ field: "status", operator: "eq", value: "active" }]);
    expect(last.sorts).toEqual([
      { field: "status", order: "asc" },
      { field: "name", order: "desc" },
    ]);
    const cells = screen.getAllByText(/Ana Ruiz|Cy Lam/).map((el) => el.textContent);
    expect(cells.indexOf("Cy Lam")).toBeLessThan(cells.indexOf("Ana Ruiz"));
  });

  it("groups the page by a field", async () => {
    const { provider } = makeProvider();
    await openClients(provider, { group: "status" });
    const sections = await screen.findAllByTestId("studio-group-section");
    expect(sections.map((s) => s.querySelector("h3")?.textContent)).toEqual(["statusactive2", "statuspaused1"]);
  });

  it("exports every matching row as CSV", async () => {
    const { provider } = makeProvider();
    const created: Blob[] = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:x";
    }) as never;
    URL.revokeObjectURL = vi.fn();
    try {
      await openClients(provider);
      await act(async () => {
        fireEvent.click(screen.getByTestId("studio-export"));
      });
      await waitFor(() => expect(created).toHaveLength(1));
      const text = await created[0]!.text();
      expect(text.split("\r\n")[0]).toBe("id,name,status,program_id,updated_at");
      expect(text).toContain("c2,Ben Ode,paused,,v1");
      expect(screen.getByTestId("studio-notice").textContent).toBe("Exported 3 rows.");
    } finally {
      URL.createObjectURL = original;
    }
  });
});
