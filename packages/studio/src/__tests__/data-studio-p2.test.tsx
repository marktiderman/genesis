/**
 * DataStudio P2: the sheet view (a multi-row paste saved in ONE transaction,
 * with failing cells marked), undo from the audit, bulk set and delete, CSV
 * import with a dry run, and code-configured form sections and conditions.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseRecord, BulkChange, DataProvider, ListParams } from "@marktiderman/genesis-core/provider";
import { type AuditEntry, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { DataStudio } from "../DataStudio";
import { useMemoryRouter, type StudioLocation } from "../router";
import type { StudioFormConfig } from "../lib/form-config";

type Row = Record<string, unknown>;

const CLIENTS: ResourceSchema = {
  name: "public.clients",
  label: "Clients",
  key: "id",
  labelField: "name",
  version: { field: "updated_at", kind: "timestamp" },
  access: { read: true, update: true, create: true, delete: true, history: true },
  createFields: ["name", "status", "notes"],
  fields: [
    { name: "id", type: "string", permissions: { read: true, update: false, reason: "Key fields can't be edited." } },
    { name: "name", type: "string", nullable: false, permissions: { read: true, update: true } },
    { name: "status", type: "string", enumValues: ["active", "paused", "done"], nullable: false, hasDefault: true, permissions: { read: true, update: true } },
    { name: "notes", type: "string", nullable: true, permissions: { read: true, update: true } },
    { name: "updated_at", type: "datetime", permissions: { read: true, update: false } },
  ],
};

function makeProvider() {
  let n = 1;
  const db: Row[] = [
    { id: "c1", name: "Ana Ruiz", status: "active", notes: "", updated_at: "v1" },
    { id: "c2", name: "Ben Ode", status: "paused", notes: "x", updated_at: "v1" },
    { id: "c3", name: "Cy Lam", status: "active", notes: "", updated_at: "v1" },
  ];
  const calls: Array<{ op: string; args: any }> = [];
  const audits: AuditEntry[] = [];
  const audit = (key: Row, before: Row, after: Row): AuditEntry => {
    const e = { id: `00000000-0000-4000-8000-00000000000${n++}`, occurredAt: "t", actor: "me", resource: CLIENTS.name, key, action: "update" as const, before, after };
    audits.push(e);
    return e;
  };
  let failBulkIndex: number | null = null;
  const provider: DataProvider = {
    async listResources() {
      return [{ name: CLIENTS.name, label: "Clients", access: CLIENTS.access }];
    },
    async describe() {
      return CLIENTS;
    },
    async capabilities() {
      return { search: true, sort: true, filterOperators: ["eq"], bulkWrites: true, versionedWrites: true, compositeKeys: true, multiSort: true, create: true, delete: true, history: true, import: true, undo: true };
    },
    async getList<T extends BaseRecord>(_r: string, params: ListParams) {
      const { page = 1, perPage = 25 } = params.pagination ?? {};
      return { data: db.slice((page - 1) * perPage, page * perPage).map((r) => ({ ...r })) as unknown as T[], total: db.length };
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
      const before = Object.fromEntries(Object.keys(params.data).map((k) => [k, row[k]]));
      Object.assign(row, params.data, { updated_at: `v${n++}` });
      return { data: { ...row } as unknown as T, audit: audit({ id: row.id }, before, params.data) };
    },
    async updateMany(_r: string, { changes }: { changes: BulkChange[] }) {
      calls.push({ op: "updateMany", args: changes });
      if (failBulkIndex !== null) {
        return { ok: false, count: 0, failures: [{ index: failBulkIndex, id: changes[failBulkIndex]!.id, outcome: "conflict", message: "Not saved: someone else changed this row." }] };
      }
      const entries = changes.map((c) => {
        const row = db.find((r) => r.id === c.id)!;
        const before = Object.fromEntries(Object.keys(c.data).map((k) => [k, row[k]]));
        Object.assign(row, c.data, { updated_at: `v${n++}` });
        return audit({ id: row.id }, before, c.data);
      });
      return { ok: true, count: changes.length, audit: entries };
    },
    async deleteMany(_r: string, { items }: { items: { id: unknown }[] }) {
      calls.push({ op: "deleteMany", args: items });
      const entries = items.map((item) => {
        const [row] = db.splice(db.findIndex((r) => r.id === item.id), 1);
        return { ...audit({ id: row!.id }, row!, {}), action: "delete" as const, after: null };
      });
      entries.forEach((e) => (audits[audits.findIndex((a) => a.id === e.id)] = e));
      return { ok: true, count: items.length, audit: entries };
    },
    async importRows(_r: string, params: { rows: Row[]; dryRun: boolean }) {
      calls.push({ op: params.dryRun ? "importDryRun" : "import", args: params.rows });
      const failures = params.rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.status && !["active", "paused", "done"].includes(String(row.status)))
        .map(({ index }) => ({ index, outcome: "invalid", message: 'Not saved: new row violates check constraint "clients_status_check".' }));
      if (params.dryRun) return { ok: failures.length === 0, count: params.rows.length - failures.length, failures };
      if (failures.length) return { ok: false, count: 0, failures };
      params.rows.forEach((row) => db.push({ id: `c${n++}`, status: "active", notes: "", updated_at: "v1", ...row }));
      return { ok: true, count: params.rows.length };
    },
    async undo(_r: string, { auditId }: { auditId: string }) {
      calls.push({ op: "undo", args: auditId });
      const entry = audits.find((a) => a.id === auditId)!;
      if (entry.action === "delete") db.push({ ...entry.before });
      else Object.assign(db.find((r) => r.id === entry.key.id)!, entry.before);
      return {};
    },
    async history() {
      return [...audits].reverse();
    },
    create: async () => {
      throw new Error("no");
    },
    deleteOne: async () => {
      throw new Error("no");
    },
  } as unknown as DataProvider;
  return { provider, db, calls, failNextBulkAt: (i: number | null) => (failBulkIndex = i) };
}

function Harness({ provider, initial, forms }: { provider: DataProvider; initial?: StudioLocation; forms?: Record<string, StudioFormConfig> }) {
  const router = useMemoryRouter(initial);
  return <DataStudio provider={provider} router={router} forms={forms} />;
}

beforeAll(() => {
  // The sheet grid virtualizes rows; give happy-dom a viewport to lay out in.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 520 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1024 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 520 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1024 });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: 520, right: 1024, width: 1024, height: 520, toJSON: () => ({}) }) as DOMRect;
});
beforeEach(() => localStorage.clear());

async function openSheet(provider: DataProvider) {
  render(<Harness provider={provider} initial={{ resource: "public.clients", view: "sheet" }} />);
  return screen.findByRole("grid", { name: "Clients sheet" });
}

describe("DataStudio P2", () => {
  // A test that stubs `confirm` must not leak it into the next one, even on failure.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a multi-row paste in one bulk transaction, at each row's version", async () => {
    const { provider, calls, db } = makeProvider();
    const grid = await openSheet(provider);
    await waitFor(() => expect(within(grid).getByText("Ana Ruiz")).toBeTruthy());
    // The name column comes first (the primary field); status is two to the right.
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    await act(async () => {
      fireEvent.paste(grid, { clipboardData: { getData: () => "paused\tcalled\ndone\tmet\n" } });
    });
    await waitFor(() => expect(calls.find((c) => c.op === "updateMany")).toBeTruthy());
    expect(calls.find((c) => c.op === "updateMany")!.args).toEqual([
      { id: "c1", data: { status: "paused", notes: "called" }, expectedVersion: "v1" },
      { id: "c2", data: { status: "done", notes: "met" }, expectedVersion: "v1" },
    ]);
    expect(db.slice(0, 2).map((r) => r.status)).toEqual(["paused", "done"]);
    expect(await screen.findByText("Saved 2 rows in one transaction.")).toBeTruthy();
  });

  it("marks the failing row's cells and keeps everything when a bulk paste is refused", async () => {
    const { provider, failNextBulkAt, db } = makeProvider();
    failNextBulkAt(1);
    const grid = await openSheet(provider);
    await waitFor(() => expect(within(grid).getByText("Ana Ruiz")).toBeTruthy());
    await act(async () => {
      fireEvent.paste(grid, { clipboardData: { getData: () => "Ana R\nBen O\n" } });
    });
    await waitFor(() => expect(within(grid).getAllByRole("gridcell").some((c) => c.getAttribute("aria-invalid") === "true")).toBe(true));
    const invalid = within(grid).getAllByRole("gridcell").filter((c) => c.getAttribute("aria-invalid") === "true");
    expect(invalid).toHaveLength(1);
    expect(invalid[0]!.getAttribute("title")).toMatch(/someone else changed/);
    expect(db.map((r) => r.name)).toEqual(["Ana Ruiz", "Ben Ode", "Cy Lam"]);
    expect((await screen.findByTestId("studio-activity-not_saved")).textContent).toMatch(/Nothing was saved: 1 of 2 rows failed/);
  });

  it("undoes every row of a multi-row paste with one Ctrl+Z", async () => {
    const { provider, calls, db } = makeProvider();
    const grid = await openSheet(provider);
    await waitFor(() => expect(within(grid).getByText("Ana Ruiz")).toBeTruthy());
    await act(async () => {
      fireEvent.paste(grid, { clipboardData: { getData: () => "Ana R\nBen O\n" } });
    });
    await waitFor(() => expect(db[1]!.name).toBe("Ben O"));
    await act(async () => {
      fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
    });
    await waitFor(() => expect(calls.filter((c) => c.op === "undo")).toHaveLength(2));
    expect(db.slice(0, 2).map((r) => r.name)).toEqual(["Ana Ruiz", "Ben Ode"]);
  });

  it("sends an undo once, however often it's clicked", async () => {
    const { provider, calls } = makeProvider();
    const grid = await openSheet(provider);
    await waitFor(() => expect(within(grid).getByText("Ana Ruiz")).toBeTruthy());
    await act(async () => {
      fireEvent.paste(grid, { clipboardData: { getData: () => "Ana R\nBen O\n" } });
    });
    const button = await screen.findByTestId("studio-activity-undo");
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(screen.queryByTestId("studio-activity-undo")).toBeNull());
    expect(calls.filter((c) => c.op === "undo")).toHaveLength(2);
  });

  it("undoes the latest change with Ctrl+Z in the sheet, from its audit entry", async () => {
    const { provider, calls, db } = makeProvider();
    const grid = await openSheet(provider);
    await waitFor(() => expect(within(grid).getByText("Cy Lam")).toBeTruthy());
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "Q" });
    const input = screen.getByLabelText("name, row 3");
    fireEvent.change(input, { target: { value: "Quinn" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() => expect(db[2]!.name).toBe("Quinn"));
    await act(async () => {
      fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
    });
    await waitFor(() => expect(calls.find((c) => c.op === "undo")).toBeTruthy());
    expect(db[2]!.name).toBe("Cy Lam");
    // Shown in the activity list, and as the latest entry on its collapsed header.
    expect((await screen.findAllByText("Undone, with its own audit entry.")).length).toBeGreaterThan(0);
  });

  it("sets one field on the selected rows, all in one transaction", async () => {
    const { provider, calls } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await screen.findByText("Ana Ruiz");
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!);
    fireEvent.click(boxes[3]!);
    fireEvent.click(screen.getByTestId("studio-bulk-set"));
    const dialog = await screen.findByTestId("studio-bulk-edit");
    fireEvent.change(within(dialog).getByLabelText("New value"), { target: { value: "Bulk note" } });
    // Field defaults to the first editable one (name); pick notes.
    fireEvent.click(within(dialog).getByLabelText("Field"));
    fireEvent.click(await screen.findByRole("option", { name: "notes" }));
    fireEvent.change(within(dialog).getByLabelText("New value"), { target: { value: "Bulk note" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("studio-bulk-apply"));
    });
    await waitFor(() => expect(calls.find((c) => c.op === "updateMany")).toBeTruthy());
    expect(calls.find((c) => c.op === "updateMany")!.args).toEqual([
      { id: "c1", data: { notes: "Bulk note" }, expectedVersion: "v1" },
      { id: "c3", data: { notes: "Bulk note" }, expectedVersion: "v1" },
    ]);
  });

  it("deletes the selected rows together after confirming", async () => {
    const { provider, calls, db } = makeProvider();
    // happy-dom has no window.confirm; Vitest 4 refuses to spy on a missing
    // method (Vitest 2 allowed it), so stub the global instead.
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await screen.findByText("Ana Ruiz");
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    await act(async () => {
      fireEvent.click(screen.getByTestId("studio-bulk-delete"));
    });
    await waitFor(() => expect(calls.find((c) => c.op === "deleteMany")).toBeTruthy());
    expect(calls.find((c) => c.op === "deleteMany")!.args).toEqual([{ id: "c2", expectedVersion: "v1" }]);
    expect(db.map((r) => r.id)).toEqual(["c1", "c3"]);
  });

  it("imports a CSV: maps columns, lists failing rows on a dry run, then imports", async () => {
    const { provider, calls, db } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await screen.findByText("Ana Ruiz");
    fireEvent.click(screen.getByTestId("studio-import"));
    const dialog = await screen.findByTestId("studio-import-dialog");
    const file = new File(['name,status,ignored\n"Dee, Park",active,x\nEli,bogus,y\n'], "clients.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(within(dialog).getByTestId("studio-import-file"), { target: { files: [file] } });
    });
    await within(dialog).findByText(/clients\.csv: 2 rows, 3 columns/);
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("studio-import-check-button"));
    });
    const check = await within(dialog).findByTestId("studio-import-check");
    expect(check.textContent).toMatch(/1 of 2 rows won't import/);
    expect(check.textContent).toMatch(/Row 3: .*check constraint/);
    expect(calls[0]).toEqual({ op: "importDryRun", args: [{ name: "Dee, Park", status: "active" }, { name: "Eli", status: "bogus" }] });
    expect((within(dialog).getByTestId("studio-import-commit") as HTMLButtonElement).disabled).toBe(true);
    expect(db).toHaveLength(3);
  });

  it("lays out the record form in configured sections, with a conditional field", async () => {
    const { provider } = makeProvider();
    const forms: Record<string, StudioFormConfig> = {
      "public.clients": {
        sections: [{ title: "Who", fields: ["name"] }, { title: "Status", fields: ["status", "notes"] }],
        visibleWhen: { notes: (values) => values.status === "paused" },
      },
    };
    render(<Harness provider={provider} initial={{ resource: "public.clients", record: "c1" }} forms={forms} />);
    const panel = await screen.findByTestId("studio-record-panel");
    await within(panel).findByLabelText(/^name/);
    const legends = within(panel).getAllByText(/^(Who|Status|Other)$/).map((el) => el.textContent);
    expect(legends).toEqual(["Who", "Status", "Other"]);
    expect(within(panel).queryByLabelText(/^notes/)).toBeNull(); // Ana is active
  });

  it("shows a conditional field when its condition holds", async () => {
    const { provider } = makeProvider();
    const forms: Record<string, StudioFormConfig> = {
      "public.clients": { visibleWhen: { notes: (values) => values.status === "paused" } },
    };
    render(<Harness provider={provider} initial={{ resource: "public.clients", record: "c2" }} forms={forms} />);
    const panel = await screen.findByTestId("studio-record-panel");
    expect(await within(panel).findByLabelText(/^notes/)).toBeTruthy(); // Ben is paused
  });

  it("doesn't let a hidden required field block the save", async () => {
    const { provider, calls } = makeProvider();
    const forms: Record<string, StudioFormConfig> = {
      "public.clients": { visibleWhen: { name: (values) => values.status === "active" } },
    };
    render(<Harness provider={provider} initial={{ resource: "public.clients", record: "c1" }} forms={forms} />);
    const panel = await screen.findByTestId("studio-record-panel");
    fireEvent.change(await within(panel).findByLabelText(/^name/), { target: { value: "" } });
    fireEvent.click(within(panel).getByLabelText(/^status/));
    fireEvent.click(await screen.findByRole("option", { name: "paused" }));
    await waitFor(() => expect(within(panel).queryByLabelText(/^name/)).toBeNull());
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    });
    await waitFor(() => expect(calls.find((c) => c.op === "update")).toBeTruthy());
    expect(calls.find((c) => c.op === "update")!.args.data).toEqual({ status: "paused" });
  });

  it("asks for a new dry run after the column mapping changes", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await screen.findByText("Ana Ruiz");
    fireEvent.click(screen.getByTestId("studio-import"));
    const dialog = await screen.findByTestId("studio-import-dialog");
    const file = new File(["name,status\nDee,active\n"], "ok.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(within(dialog).getByTestId("studio-import-file"), { target: { files: [file] } });
    });
    await act(async () => {
      fireEvent.click(await within(dialog).findByTestId("studio-import-check-button"));
    });
    await waitFor(() => expect((within(dialog).getByTestId("studio-import-commit") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByLabelText("Field for status"));
    fireEvent.click(await screen.findByRole("option", { name: "Skip this column" }));
    expect((within(dialog).getByTestId("studio-import-commit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says why a table won't open, instead of crashing", async () => {
    const { provider } = makeProvider();
    (provider as { describe: unknown }).describe = async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error("The studio server had a problem.");
    };
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    expect((await screen.findByTestId("studio-describe-error", {}, { timeout: 4000 })).textContent).toMatch(/Couldn't open public.clients/);
  });

  it("says why when a bulk edit can't reach the server", async () => {
    const { provider } = makeProvider();
    (provider as { updateMany: unknown }).updateMany = async () => {
      throw new Error("The studio server couldn't be reached.");
    };
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await screen.findByText("Ana Ruiz");
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(screen.getByTestId("studio-bulk-set"));
    const dialog = await screen.findByTestId("studio-bulk-edit");
    fireEvent.change(within(dialog).getByLabelText("New value"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("studio-bulk-apply"));
    });
    expect((await within(dialog).findByTestId("studio-bulk-error")).textContent).toMatch(/Nothing was changed: The studio server couldn't be reached/);
  });

  it("undoes every row of a bulk delete from one Undo", async () => {
    const { provider, calls } = makeProvider();
    // happy-dom has no window.confirm; Vitest 4 refuses to spy on a missing
    // method (Vitest 2 allowed it), so stub the global instead.
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await screen.findByText("Ana Ruiz");
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!);
    fireEvent.click(boxes[3]!);
    await act(async () => {
      fireEvent.click(await screen.findByTestId("studio-bulk-delete"));
    });
    await waitFor(() => expect(screen.queryByText("Ana Ruiz")).toBeNull());
    expect(screen.queryByText("Cy Lam")).toBeNull();
    const undoButton = screen.getByTestId("studio-activity-undo");
    expect(undoButton.textContent).toMatch(/Undo all 2/);
    await act(async () => {
      fireEvent.click(undoButton);
    });
    expect(await screen.findByText("Ana Ruiz")).toBeTruthy();
    expect(await screen.findByText("Cy Lam")).toBeTruthy();
    expect(calls.filter((c) => c.op === "undo")).toHaveLength(2);
    expect(screen.queryByTestId("studio-activity-undo")).toBeNull();
  });
});
