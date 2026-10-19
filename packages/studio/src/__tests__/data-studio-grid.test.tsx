/**
 * The Airtable-style workspace: tables as tabs, views on the left, the grid
 * by default with the name field first, choices as colored pills, hidden
 * fields that stick, an "Add a record" row, and selecting rows for bulk work.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseRecord, DataProvider, ListParams } from "@marktiderman/genesis-core/provider";
import type { ResourceSchema } from "@marktiderman/genesis-core/schema";
import { DataStudio } from "../DataStudio";
import { useMemoryRouter, type StudioLocation } from "../router";
import { pillTint } from "../grid/cells";

type Row = Record<string, unknown>;

const CLIENTS: ResourceSchema = {
  name: "public.clients",
  label: "Clients",
  key: "id",
  labelField: "name",
  version: { field: "updated_at", kind: "timestamp" },
  access: { read: true, update: true, create: true, delete: true },
  createFields: ["name"],
  fields: [
    { name: "id", type: "string", permissions: { read: true, update: false } },
    { name: "name", type: "string", permissions: { read: true, update: true } },
    { name: "status", type: "string", enumValues: ["active", "paused", "done"], permissions: { read: true, update: true } },
    { name: "starts_on", type: "datetime", dbType: "date", nullable: true, permissions: { read: true, update: true } },
    { name: "updated_at", type: "datetime", permissions: { read: true, update: false } },
  ],
};
const NOTES: ResourceSchema = {
  name: "public.notes",
  label: "Notes",
  key: "id",
  access: { read: true, update: false, reason: "Read-only: editing isn't enabled for this table." },
  fields: [{ name: "id", type: "number", permissions: { read: true, update: false } }],
};

function makeProvider() {
  const db: Row[] = [
    { id: "c1", name: "Ana Ruiz", status: "active", starts_on: "2026-10-05", updated_at: "v1" },
    { id: "c2", name: "Ben Ode", status: "paused", starts_on: null, updated_at: "v1" },
  ];
  const provider = {
    async listResources() {
      return [CLIENTS, NOTES].map(({ name, label, access }) => ({ name, label, access }));
    },
    async describe(resource: string) {
      return resource === CLIENTS.name ? CLIENTS : NOTES;
    },
    async capabilities() {
      return { search: true, sort: true, filterOperators: ["eq"], bulkWrites: true, versionedWrites: true, compositeKeys: true, multiSort: true, create: true, delete: true };
    },
    async getList<T extends BaseRecord>(resource: string, _params: ListParams) {
      const rows = resource === CLIENTS.name ? db : [];
      return { data: rows.map((r) => ({ ...r })) as unknown as T[], total: rows.length };
    },
    async getOne<T extends BaseRecord>(_r: string, { id }: { id: unknown }) {
      return { data: { ...db.find((r) => r.id === id)! } as unknown as T };
    },
    async getMany() {
      return { data: [] };
    },
    async update() {
      throw new Error("no");
    },
    async updateMany() {
      return { ok: true, count: 0 };
    },
    async deleteMany() {
      return { ok: true, count: 0 };
    },
    create: async () => {
      throw new Error("no");
    },
    deleteOne: async () => {
      throw new Error("no");
    },
  } as unknown as DataProvider;
  return { provider };
}

function Harness({ provider, initial }: { provider: DataProvider; initial?: StudioLocation }) {
  const router = useMemoryRouter(initial);
  return <DataStudio provider={provider} router={router} title="Coaching" />;
}

beforeEach(() => localStorage.clear());

describe("The Airtable-style workspace", () => {
  it("shows tables as tabs and opens one in the grid, name first", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} />);
    const tabs = await screen.findByRole("navigation", { name: "Tables" });
    expect((await within(tabs).findAllByRole("button")).map((b) => b.textContent)).toEqual(["Clients", "Notes"]);
    expect(within(tabs).getByLabelText("Read-only")).toBeTruthy();
    fireEvent.click(within(tabs).getByText("Clients"));
    const grid = await screen.findByRole("grid", { name: "Clients sheet" });
    await within(grid).findByText("Ana Ruiz");
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["name", "id", "status", "starts_on", "updated_at"]);
    expect(within(tabs).getByText("Clients").getAttribute("aria-current")).toBe("page");
    // Grid is the default view, and the others say why they're available.
    const views = screen.getByRole("navigation", { name: "Views" });
    expect(within(views).getByTestId("studio-view-grid").getAttribute("aria-pressed")).toBe("true");
    expect((within(views).getByTestId("studio-view-kanban") as HTMLButtonElement).disabled).toBe(false);
    expect((within(views).getByTestId("studio-view-calendar") as HTMLButtonElement).disabled).toBe(false);
    expect(await screen.findByText("2 records")).toBeTruthy();
  });

  it("shows choices as pills, with status words in their meaning's color", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    const pill = await screen.findByText("active");
    expect(pill.className).toContain("rounded-full");
    expect(pillTint("active")).toBe("bg-success/20");
    expect(pillTint("paused")).toBe("bg-warning/25");
    expect(pillTint("archived")).toBe("bg-muted");
    expect(pillTint("gold", ["bronze", "silver", "gold"])).toBe(pillTint("gold", ["bronze", "silver", "gold"]));
  });

  it("hides fields, and remembers it for the table", async () => {
    const { provider } = makeProvider();
    const view = render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    const grid = await screen.findByRole("grid", { name: "Clients sheet" });
    await within(grid).findByText("Ana Ruiz");
    fireEvent.click(screen.getByTestId("studio-hide-fields"));
    fireEvent.click(await screen.findByRole("checkbox", { name: "updated_at" }));
    await waitFor(() => expect(within(grid).queryByRole("columnheader", { name: "updated_at" })).toBeNull());
    expect(screen.getByTestId("studio-hide-fields").textContent).toMatch(/1 hidden field/);
    view.unmount();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    const again = await screen.findByRole("grid", { name: "Clients sheet" });
    await within(again).findByText("Ana Ruiz");
    expect(within(again).queryByRole("columnheader", { name: "updated_at" })).toBeNull();
  });

  it("adds a record from the row under the grid", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    fireEvent.click(await screen.findByTestId("studio-add-record"));
    expect(await screen.findByTestId("studio-create-dialog")).toBeTruthy();
  });

  it("selects rows for bulk actions, in place of the view controls", async () => {
    const { provider } = makeProvider();
    render(<Harness provider={provider} initial={{ resource: "public.clients" }} />);
    const boxes = await screen.findAllByTestId("studio-row-select");
    await act(async () => {
      fireEvent.click(boxes[0]!);
    });
    const selection = screen.getByTestId("studio-selection");
    expect(selection.textContent).toMatch(/1 selected/);
    expect(within(selection).getByTestId("studio-bulk-set")).toBeTruthy();
    expect(screen.queryByTestId("studio-filter")).toBeNull();
    fireEvent.click(within(selection).getByLabelText("Clear the selection"));
    expect(screen.queryByTestId("studio-selection")).toBeNull();
    expect(screen.getByTestId("studio-filter")).toBeTruthy();
  });
});

describe("Embedding with no wiring", () => {
  it("runs with no router (the page's query string) and keys data to the provider's session", async () => {
    const { provider } = makeProvider();
    let emit: (id: string | null) => void = () => {};
    const withSession = Object.assign(provider, {
      session: {
        subscribe(listener: (id: string | null) => void) {
          emit = listener;
          listener("u1");
          return () => {};
        },
      },
    });
    window.history.replaceState(null, "", "/admin/data?table=public.clients");
    render(<DataStudio provider={withSession} />);
    const grid = await screen.findByRole("grid", { name: "Clients sheet" });
    await within(grid).findByText("Ana Ruiz");
    fireEvent.click(screen.getByText("Notes"));
    await waitFor(() => expect(window.location.search).toBe("?table=public.notes"));
    // A different user signs in: what the first one loaded is dropped and asked for again.
    await act(async () => emit("u2"));
    expect(await screen.findByRole("navigation", { name: "Tables" })).toBeTruthy();
    window.history.replaceState(null, "", "/");
  });
});
