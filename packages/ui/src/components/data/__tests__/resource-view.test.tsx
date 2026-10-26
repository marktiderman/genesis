/**
 * ResourceView: a genesis-core view mapped onto ResourcePage.
 * - labels, display hints and `when` reach the cells;
 * - screen filters, tab filters and the view's order reach the provider;
 * - guards only narrow, and the form lists only writable fields;
 * - a calendar day is the same day west of UTC (DateCell too).
 */
// West of UTC, where `new Date("2026-01-02")` is the 1st.
process.env.TZ = "America/Los_Angeles";

import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { DateCell } from "../cell-formatters";
import { DisplayRenderersProvider, ResourceView, useResourceView, useResourceViewProps } from "../resource-view";

type Brand = {
  id: string;
  practice_id: string;
  name: string;
  status: "active" | "archived";
  is_default: boolean;
  website: string | null;
  launched_on: string | null;
  secret: string | null;
  secret_visible: boolean;
  updated_at: string;
};

const brands = defineResource<Brand>()({
  name: "brands",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "practice_id", type: "string" },
    { name: "name", type: "string" },
    { name: "status", type: "string", enumValues: ["active", "archived"], hasDefault: true },
    { name: "is_default", type: "boolean", hasDefault: true },
    { name: "website", type: "string", widget: "url", nullable: true },
    { name: "launched_on", type: "datetime", dbType: "date", nullable: true },
    { name: "secret", type: "string", nullable: true },
    { name: "secret_visible", type: "boolean", hasDefault: true },
    { name: "updated_at", type: "datetime", hasDefault: true, readOnly: true },
  ],
});

const view = defineView(brands, {
  scope: ["practice_id"],
  fields: {
    status: { tones: { active: "success" } },
    secret: { label: "Secret", when: (r) => r.secret_visible },
  },
  columns: {
    default: ["name", "status", "website", "launched_on", "secret", { key: "shout", label: "Shout", value: (r) => r.name.toUpperCase() }],
    compact: ["name"],
  },
  presets: { archived: { columns: "compact", filter: { status: "archived" } } },
  form: ["name", { section: "details", title: "Details", fields: ["status", "website", "updated_at"] }],
  orderBy: { field: "name" },
  can: { delete: (r) => (r.is_default ? "The default brand stays." : true) },
});

const ROWS: Brand[] = [
  {
    id: "b1",
    practice_id: "p1",
    name: "Northwind",
    status: "active",
    is_default: true,
    website: "javascript:alert(1)",
    launched_on: "2026-01-02",
    secret: "hidden",
    secret_visible: false,
    updated_at: "2026-01-02T10:00:00Z",
  },
  {
    id: "b2",
    practice_id: "p1",
    name: "Contoso",
    status: "archived",
    is_default: false,
    website: "https://contoso.example",
    launched_on: null,
    secret: "shown",
    secret_visible: true,
    updated_at: "2026-01-02T10:00:00Z",
  },
];

function provider(): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: ROWS, total: ROWS.length })) as DataProvider["getList"],
    getOne: vi.fn(async (_r, { id }) => ({ data: ROWS.find((r) => r.id === id) })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
  };
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

describe("ResourceView", () => {
  it("draws the view: labels, hints, hidden cells, unsafe links as text", async () => {
    localStorage.clear();
    const Wrapper = wrap(provider());
    render(<ResourceView view={view} mode="table" detail="none" />, { wrapper: Wrapper });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    expect(screen.getAllByText("Brands").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: /Launched On/ })).toBeTruthy();
    expect(within(row).getByText("Active")).toBeTruthy();
    // A day, not an instant: Jan 2 stays Jan 2 west of UTC.
    expect(within(row).getByText(/Jan 2, 2026/)).toBeTruthy();
    // `when` hides the masked value; a javascript: link is plain text.
    expect(within(row).queryByText("hidden")).toBeNull();
    expect(within(row).queryByRole("link")).toBeNull();
    expect(within(row).getByText("NORTHWIND")).toBeTruthy();
    const other = screen.getByText("Contoso").closest("tr")!;
    expect(within(other).getByRole("link", { name: "contoso.example" }).getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(other).getByText("shown")).toBeTruthy();
  });

  it("lets an app replace a renderer", async () => {
    localStorage.clear();
    const Wrapper = wrap(provider());
    render(
      <DisplayRenderersProvider renderers={{ badge: (v) => <b>status:{String(v)}</b> }}>
        <ResourceView view={view} mode="table" detail="none" />
      </DisplayRenderersProvider>,
      { wrapper: Wrapper },
    );
    expect(await screen.findByText("status:active")).toBeTruthy();
  });

  it("draws a cell the screen's own way, keeping the view's column", async () => {
    localStorage.clear();
    render(<ResourceView view={view} mode="table" detail="none" cells={{ name: (r) => <i>★ {r.name}</i> }} />, {
      wrapper: wrap(provider()),
    });
    expect(await screen.findByText("★ Northwind")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Name/ })).toBeTruthy();
  });

  it("sends the screen's filter, the tab's filter and the view's order to the provider", async () => {
    localStorage.clear();
    const p = provider();
    render(<ResourceView view={view} preset="archived" filter={{ practice_id: "p1", website: null }} mode="table" detail="none" />, {
      wrapper: wrap(p),
    });
    await screen.findByText("Contoso");
    const params = vi.mocked(p.getList).mock.calls[0]![1] as ListParams;
    expect(params.filters).toEqual(
      expect.arrayContaining([
        { field: "status", operator: "eq", value: "archived" },
        { field: "practice_id", operator: "eq", value: "p1" },
        { field: "website", operator: "is_null" },
      ]),
    );
    expect(params.sort).toEqual({ field: "name", order: "asc" });
    // The tab's compact columns.
    expect(screen.queryByRole("columnheader", { name: /Status/ })).toBeNull();
  });

  it("guards narrow: the default brand can't be deleted, and a screen rule narrows further", async () => {
    localStorage.clear();
    const { result } = renderHook(() => useResourceView({ view, can: (action) => action !== "create" }), {
      wrapper: wrap(provider()),
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.can("delete", ROWS[0])).toBe(false);
    expect(result.current.can("delete", ROWS[1])).toBe(true);
    expect(result.current.can("create")).toBe(false);
  });

  it("builds a form of writable fields in sections, never scope or read-only ones", () => {
    const { result } = renderHook(() => useResourceViewProps({ view }), { wrapper: wrap(provider()) });
    const fields = result.current.formFields!;
    expect(fields.map((f) => f.key)).toEqual(["name", "status", "website"]);
    expect(fields.find((f) => f.key === "status")).toMatchObject({ type: "select", group: "Details", required: false });
    expect(fields.find((f) => f.key === "website")!.type).toBe("url");
    expect(result.current.titleField).toBe("name");
    expect(result.current.searchFields).toEqual(["name"]);
  });

  it("refuses a tab the view doesn't define", () => {
    expect(() => renderHook(() => useResourceViewProps({ view, preset: "nope" }), { wrapper: wrap(provider()) })).toThrow(/no preset "nope"/);
  });
});

describe("DateCell", () => {
  it("shows a calendar day as that day west of UTC", () => {
    expect(DateCell({ relative: false })(null, "2026-01-02")).toBe("Jan 2, 2026");
  });
});
