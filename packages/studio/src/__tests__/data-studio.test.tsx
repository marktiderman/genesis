/**
 * DataStudio against an in-memory provider that behaves like the studio
 * handler: per-user schema, version-checked updates, audit entries, and the
 * same `DataWriteError` outcomes. What this locks in is what the user SEES:
 * which tables are editable, that a save shows its audit entry, and that a
 * stale edit shows "not saved" with the other person's value instead of
 * silently winning.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseRecord, DataProvider } from "@marktiderman/genesis-core/provider";
import { DataWriteError, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { DataStudio } from "../DataStudio";
import { useMemoryRouter, type StudioLocation } from "../router";

const CLIENTS: ResourceSchema = {
  name: "public.clients",
  label: "Clients",
  key: "id",
  version: { field: "updated_at", kind: "timestamp" },
  access: { read: true, update: true },
  fields: [
    { name: "id", type: "string", permissions: { read: true, update: false, reason: "Key fields can't be edited." } },
    { name: "name", type: "string", permissions: { read: true, update: true } },
    { name: "status", type: "string", enumValues: ["active", "paused"], permissions: { read: true, update: true } },
    { name: "notes", type: "string", nullable: true, permissions: { read: true, update: true } },
    { name: "updated_at", type: "datetime", permissions: { read: true, update: false } },
  ],
};

const PAYMENTS: ResourceSchema = {
  name: "public.payments",
  label: "Payments",
  key: ["client_id", "month"],
  access: { read: true, update: false, reason: "Read-only: editing isn't enabled for this table." },
  fields: [
    { name: "client_id", type: "string", permissions: { read: true, update: false } },
    { name: "month", type: "string", permissions: { read: true, update: false } },
    { name: "amount", type: "number", permissions: { read: true, update: false } },
  ],
};

function makeProvider() {
  let version = 1;
  const state = {
    signedIn: true,
    clients: [{ id: "c1", name: "Ana Ruiz", status: "active", notes: "Prefers mornings", updated_at: "v1" }] as Row[],
    payments: [{ client_id: "c1", month: "2026-10", amount: 120 }] as Row[],
    updates: [] as Array<{ id: unknown; data: unknown; expectedVersion: unknown }>,
  };
  type Row = Record<string, unknown>;
  const guard = () => {
    if (!state.signedIn) throw new DataWriteError("unauthenticated", "Sign in to use the studio.");
  };
  const provider: DataProvider = {
    async listResources() {
      guard();
      return [CLIENTS, PAYMENTS].map(({ name, label, access }) => ({ name, label, access }));
    },
    async describe(resource) {
      guard();
      return resource === "public.clients" ? CLIENTS : PAYMENTS;
    },
    async getList<T extends BaseRecord>(resource: string) {
      guard();
      const rows = resource === "public.clients" ? state.clients : state.payments;
      return { data: rows.map((r) => ({ ...r })) as unknown as T[], total: rows.length };
    },
    async update<T extends BaseRecord>(_resource: string, params: { id: unknown; data: Record<string, unknown>; expectedVersion?: string | null }) {
      guard();
      state.updates.push({ id: params.id, data: params.data, expectedVersion: params.expectedVersion });
      const row = state.clients.find((r) => r.id === params.id)!;
      if (params.expectedVersion !== row.updated_at) {
        throw new DataWriteError("conflict", "Not saved: someone else changed this row. Review their change and try again.", {
          current: { ...row },
          currentVersion: String(row.updated_at),
        });
      }
      const field = Object.keys(params.data)[0]!;
      const before = { [field]: row[field], updated_at: row.updated_at };
      Object.assign(row, params.data, { updated_at: `v${++version}` });
      return {
        data: { ...row } as unknown as T,
        version: String(row.updated_at),
        audit: {
          id: "4f2c9a1e-0000-4000-8000-000000000000",
          occurredAt: "2026-10-19 09:41:55.123456+00",
          actor: "coach-a",
          resource: "public.clients",
          key: { id: row.id },
          action: "update" as const,
          before,
          after: { [field]: row[field], updated_at: row.updated_at },
        },
      };
    },
    getOne: async () => ({ data: {} as never }),
    getMany: async () => ({ data: [] }),
    create: async () => {
      throw new Error("no");
    },
    deleteOne: async () => {
      throw new Error("no");
    },
  } as DataProvider;
  return { provider, state };
}

function Harness({ provider, initial }: { provider: DataProvider; initial?: StudioLocation }) {
  const router = useMemoryRouter(initial);
  return <DataStudio provider={provider} router={router} signIn={<button type="button">Sign in</button>} />;
}

/** Double-click a cell to edit it, as in Airtable; Enter saves. */
async function editCell(from: string, to: string) {
  fireEvent.doubleClick(await screen.findByText(from));
  const input = screen.getByDisplayValue(from);
  fireEvent.change(input, { target: { value: to } });
  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
}

beforeEach(() => localStorage.clear());

describe("DataStudio", () => {
  it("lists the tables this user may see and marks the read-only ones with why", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} />);
    const sidebar = await screen.findByTestId("studio-sidebar");
    await within(sidebar).findByText("Clients");
    const payments = within(sidebar).getByTestId("studio-table-public.payments");
    expect(payments.getAttribute("title")).toMatch(/editing isn't enabled/);
    expect(within(payments).getByLabelText("Read-only")).toBeTruthy();
    expect(screen.getByTestId("studio-empty").textContent).toMatch(/Pick a table/);
  });

  it("opens a table from the sidebar and shows why a read-only one can't be edited", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} />);
    fireEvent.click(await screen.findByTestId("studio-table-public.payments"));
    expect((await screen.findByTestId("studio-read-only")).textContent).toMatch(/editing isn't enabled/);
    expect(await screen.findByText("120")).toBeTruthy();
  });

  it("saves a cell with the version it was read at, and shows the audit entry", async () => {
    const { provider, state } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await editCell("Prefers mornings", "Moved to evenings");

    await waitFor(() => expect(screen.getByTestId("studio-activity-saved")).toBeTruthy());
    expect(state.updates).toEqual([{ id: "c1", data: { notes: "Moved to evenings" }, expectedVersion: "v1" }]);
    const audit = screen.getByTestId("studio-audit-entry").textContent ?? "";
    expect(audit).toMatch(/audit 4f2c9a1e/);
    expect(audit).toMatch(/by coach-a/);
    expect(audit).toMatch(/notes: Prefers mornings → Moved to evenings/);
    expect(await screen.findByText("Moved to evenings")).toBeTruthy();
  });

  it("never sends a save when nothing changed", async () => {
    const { provider, state } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await editCell("Ana Ruiz", "Ana Ruiz");
    expect(state.updates).toHaveLength(0);
  });

  it("refuses a stale edit, says why, and shows the other person's value", async () => {
    const { provider, state } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    await screen.findByText("Prefers mornings");
    // Someone else edits the row after it was loaded.
    Object.assign(state.clients[0]!, { notes: "Their change", updated_at: "v9" });

    await editCell("Prefers mornings", "My change");

    // The cell is marked with why, and nothing was saved.
    await waitFor(() =>
      expect(screen.getAllByRole("gridcell").some((c) => /someone else changed this row/.test(c.getAttribute("title") ?? ""))).toBe(true),
    );
    expect(screen.getByTestId("studio-activity-not_saved").textContent).toMatch(/someone else changed this row/);
    expect(state.clients[0]!.notes).toBe("Their change");

    // The grid then shows the row as it is now, so the next edit starts from it.
    expect(await screen.findByText("Their change")).toBeTruthy();
    await editCell("Their change", "Building on theirs");
    await waitFor(() => expect(screen.getByTestId("studio-activity-saved")).toBeTruthy());
    expect(state.updates.at(-1)).toMatchObject({ expectedVersion: "v9" });
  });

  it("shows the sign-in slot when nobody is signed in", async () => {
    const { provider, state } = makeProvider();
    state.signedIn = false;
    render(<Harness provider={provider} />);
    expect(await screen.findByTestId("studio-sign-in")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("comes back when the same user signs in again (a new provider, the same sessionKey)", async () => {
    const stale = makeProvider();
    stale.state.signedIn = false;
    const view = render(<Harness provider={stale.provider} />);
    await screen.findByTestId("studio-sign-in");
    // A fresh token means a fresh provider object; the user id is unchanged,
    // and the old token keeps being refused.
    view.rerender(<Harness provider={makeProvider().provider} />);
    expect(await screen.findByText("Clients")).toBeTruthy();
    expect(screen.queryByTestId("studio-sign-in")).toBeNull();
  });
});
