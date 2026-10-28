/**
 * ResourceView: a genesis-core view mapped onto ResourcePage.
 * - labels, display hints and `when` reach the cells;
 * - screen filters, tab filters and the view's order reach the provider;
 * - guards only narrow, and the form lists only writable fields;
 * - a calendar day is the same day west of UTC (DateCell too).
 */
// West of UTC, where `new Date("2026-01-02")` is the 1st.
(globalThis as unknown as { process: { env: Record<string, string> } }).process.env.TZ = "America/Los_Angeles";

import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, ViewerScope, type DataProvider, type ListParams, type Viewer } from "@marktiderman/genesis-core";
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

  it("draws the summary's picture beside the first column: initials when the src is unsafe", async () => {
    localStorage.clear();
    const pictured = defineView(brands, {
      columns: { default: ["name", "status"] },
      summary: (r) => ({
        title: r.name,
        image: { src: r.website ?? undefined, name: r.name },
      }),
    });
    render(<ResourceView view={pictured} mode="table" detail="none" />, { wrapper: wrap(provider()) });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    const avatar = within(row).getByTestId("resource-view-avatar");
    // javascript: is never an image src; the initials stand in, decorative beside the name.
    expect(avatar.textContent).toBe("N");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(row.querySelector("img")).toBeNull();
    // Only the first column gets it.
    expect(within(row).getAllByTestId("resource-view-avatar")).toHaveLength(1);
  });

  it("an image that hasn't loaded shows the name's initials", async () => {
    localStorage.clear();
    const pictured = defineView(brands, {
      columns: { default: ["name", "status"] },
      summary: (r) => ({ title: r.name, image: { src: "https://example.com/logo.png", name: `${r.name} Ltd` } }),
    });
    render(<ResourceView view={pictured} mode="table" detail="none" />, { wrapper: wrap(provider()) });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    // jsdom never loads images, so Radix shows the fallback: the image result's initials.
    expect(within(row).getByTestId("resource-view-avatar").textContent).toBe("NL");
  });

  it("draws no picture when the summary has none", async () => {
    localStorage.clear();
    render(<ResourceView view={view} mode="table" detail="none" />, { wrapper: wrap(provider()) });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    expect(within(row).queryByTestId("resource-view-avatar")).toBeNull();
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

  it("shows a badge and its form choices in the view's words", async () => {
    localStorage.clear();
    const labelled = defineView(brands, {
      fields: { status: { labels: { active: "Published" } } },
      columns: { default: ["name", "status"] },
      form: ["name", "status"],
    });
    render(<ResourceView view={labelled} mode="table" detail="none" />, { wrapper: wrap(provider()) });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    expect(within(row).getByText("Published")).toBeTruthy();
    const { result } = renderHook(() => useResourceViewProps({ view: labelled }), { wrapper: wrap(provider()) });
    expect(result.current.formFields!.find((f) => f.key === "status")!.options).toEqual([
      { value: "active", label: "Published" },
      { value: "archived", label: "Archived" },
    ]);
  });

  it("refuses a tab the view doesn't define", () => {
    expect(() => renderHook(() => useResourceViewProps({ view, preset: "nope" }), { wrapper: wrap(provider()) })).toThrow(/no preset "nope"/);
  });
});

describe("ResourceView with viewer-aware guards", () => {
  const isEditor = (v: Viewer) => ((v.roles as { teamRoles?: readonly string[] } | undefined)?.teamRoles ?? []).includes("editor");
  const guarded = defineView(brands, {
    fields: { secret: { label: "Secret", when: (_r, v) => isEditor(v) } },
    columns: { default: ["name", "secret"] },
    form: ["name"],
    can: {
      create: (v) => (isEditor(v) ? true : "Only editors add brands."),
      delete: (r, v) => (r.is_default ? "The default brand stays." : isEditor(v) ? true : "Only editors delete brands."),
    },
  });

  function scoped(p: DataProvider) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    return ({ children, viewer, roles }: { children: ReactNode; viewer?: string; roles?: { teamRoles: string[] } }) => (
      <GenesisProvider provider={p} queryClient={queryClient}>
        {viewer ? (
          <ViewerScope viewer={viewer} roles={roles}>
            {children}
          </ViewerScope>
        ) : (
          children
        )}
      </GenesisProvider>
    );
  }

  it("refuses one viewer, allows another, and asks again when the viewer changes", async () => {
    localStorage.clear();
    const Scoped = scoped(provider());
    // renderHook's wrapper takes no props: it reads who is looking from here.
    let who: { viewer: string; roles: { teamRoles: string[] } } = { viewer: "bob", roles: { teamRoles: ["reader"] } };
    const { result, rerender } = renderHook(() => useResourceView({ view: guarded }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Scoped viewer={who.viewer} roles={who.roles}>
          {children}
        </Scoped>
      ),
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.can("create")).toBe(false);
    expect(result.current.can("delete", ROWS[1])).toBe(false);
    // A new viewer remounts the screen under ViewerScope; the guards are asked again.
    who = { viewer: "ann", roles: { teamRoles: ["editor"] } };
    rerender();
    await waitFor(() => expect(result.current.can("create")).toBe(true));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.can("delete", ROWS[1])).toBe(true);
    // The guard still narrows for the editor.
    expect(result.current.can("delete", ROWS[0])).toBe(false);
  });

  it("hands `when` the viewer: hidden for one viewer, shown for another", async () => {
    localStorage.clear();
    const Scoped = scoped(provider());
    const { unmount } = render(
      <Scoped viewer="bob" roles={{ teamRoles: ["reader"] }}>
        <ResourceView view={guarded} mode="table" detail="none" />
      </Scoped>,
    );
    const row = (await screen.findByText("Contoso")).closest("tr")!;
    expect(within(row).queryByText("shown")).toBeNull();
    unmount();
    render(
      <Scoped viewer="ann" roles={{ teamRoles: ["editor"] }}>
        <ResourceView view={guarded} mode="table" detail="none" />
      </Scoped>,
    );
    const other = (await screen.findByText("Contoso")).closest("tr")!;
    expect(within(other).getByText("shown")).toBeTruthy();
  });

  // The same viewer, only roles changing: ViewerScope keeps the screen mounted, so the guards and
  // `when` must be asked again from the viewer in their memos' dependencies.
  it("asks the guards and `when` again when only the roles change, without remounting", async () => {
    localStorage.clear();
    const withUpdate = defineView(brands, {
      fields: { secret: { label: "Secret", when: (_r, v) => isEditor(v) } },
      columns: { default: ["name", "secret"] },
      form: ["name"],
      can: {
        create: (v) => (isEditor(v) ? true : "Only editors add brands."),
        update: (_r, v) => (isEditor(v) ? true : "Only editors edit brands."),
        delete: (r, v) => (r.is_default ? "The default brand stays." : isEditor(v) ? true : "Only editors delete brands."),
      },
    });
    let mounts = 0;
    function Mounts() {
      useState(() => (mounts += 1));
      return null;
    }
    const Scoped = scoped(provider());
    const at = (roles?: { teamRoles: string[] }) => (
      <Scoped viewer="ann" roles={roles}>
        <Mounts />
        <ResourceView view={withUpdate} mode="table" />
      </Scoped>
    );
    const newButton = () => screen.queryByRole("button", { name: /new|add/i, hidden: true });
    const secret = () => within(screen.getAllByText("Contoso").map((e) => e.closest("tr")).find(Boolean)!).queryByText("shown");
    const edit = () => screen.queryByTestId("detail-panel-edit");
    const del = () => screen.queryByTestId("detail-panel-delete");

    // Roles not known yet: every guard refuses, the cell is hidden.
    const { rerender } = render(at(undefined));
    await screen.findByText("Contoso");
    fireEvent.click(screen.getByText("Contoso").closest("tr")!);
    expect(newButton()).toBeNull();
    expect(secret()).toBeNull();
    expect(edit()).toBeNull();
    expect(del()).toBeNull();

    // Roles arrive (undefined → editor): the same mounted screen allows, and shows the cell.
    rerender(at({ teamRoles: ["editor"] }));
    await waitFor(() => expect(newButton()).toBeTruthy());
    expect(secret()).toBeTruthy();
    expect(edit()).toBeTruthy();
    expect(del()).toBeTruthy();

    // Roles change (editor → reader): refused again and hidden again, still the same mount.
    rerender(at({ teamRoles: ["reader"] }));
    await waitFor(() => expect(newButton()).toBeNull());
    await waitFor(() => expect(secret()).toBeNull());
    expect(edit()).toBeNull();
    expect(del()).toBeNull();
    expect(mounts).toBe(1);
  });

  it("fails closed without a ViewerScope", async () => {
    localStorage.clear();
    const { result } = renderHook(() => useResourceView({ view: guarded }), { wrapper: scoped(provider()) });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.can("create")).toBe(false);
    expect(result.current.can("delete", ROWS[1])).toBe(false);
  });
});

describe("ResourceView review fixes", () => {
  it("the peek shows only the view's columns, with `when` and sensitive values held back", async () => {
    localStorage.clear();
    const withSensitive = defineResource<Brand & { staff_note: string }>()({
      name: "brands", key: "id", labelField: "name",
      fields: [...brands.fields, { name: "staff_note", type: "string", sensitive: true }],
    });
    const v = defineView(withSensitive, { fields: { secret: { when: (r) => r.secret_visible } }, columns: { default: ["name", "secret"] } });
    const p = provider();
    p.getList = vi.fn(async () => ({ data: [{ ...ROWS[0], staff_note: "STAFF-ONLY" }], total: 1 })) as DataProvider["getList"];
    const { result } = renderHook(() => useResourceViewProps({ view: v }), { wrapper: wrap(p) });
    expect(result.current.detailFields!.map((f) => f.key)).toEqual(["name", "secret"]);
    render(<>{result.current.detailFields![1]!.render!(undefined, { ...ROWS[0], staff_note: "STAFF-ONLY" })}</>);
    expect(screen.queryByText("hidden")).toBeNull();
    expect(result.current.getSubtitle!(ROWS[0] as never)).toBeUndefined();
  });

  it("pages on the server by default, and leaves JSON out of the form", () => {
    const withJson = defineResource<Brand & { meta: unknown }>()({
      name: "brands", key: "id", labelField: "name",
      fields: [...brands.fields, { name: "meta", type: "json", nullable: true }],
    });
    const v = defineView(withJson, { form: ["name", "meta"] });
    const { result } = renderHook(() => useResourceViewProps({ view: v }), { wrapper: wrap(provider()) });
    expect(result.current.pagination).toBe("server");
    expect(result.current.formFields!.map((f) => f.key)).toEqual(["name"]);
    const { result: cursor } = renderHook(() => useResourceViewProps({ view: v, pagination: "cursor" }), { wrapper: wrap(provider()) });
    expect(cursor.current.pagination).toBe("cursor");
  });

  it("fills the screen's filter into a create, hidden, and only for fields the resource has", () => {
    const { result } = renderHook(() => useResourceViewProps({ view, filter: { practice_id: "p1", nope: 1 } as never }), {
      wrapper: wrap(provider()),
    });
    const filled = result.current.formFields!.filter((f) => f.hidden);
    expect(filled).toEqual([{ key: "practice_id", type: "hidden", hidden: true, readOnlyOnEdit: true, defaultValue: "p1" }]);
  });

  it("lets the filter win a clash with defaults on a shown field too", () => {
    const { result } = renderHook(
      () => useResourceViewProps({ view, filter: { status: "archived" }, defaults: { status: "active", name: "Untitled" } }),
      { wrapper: wrap(provider()) },
    );
    expect(result.current.formFields!.find((f) => f.key === "status")).toMatchObject({ defaultValue: "archived" });
  });

  it("makes no form from a filter alone: a view with no form fields offers no New or Edit", () => {
    const listOnly = defineView(brands, { form: [] });
    const { result } = renderHook(() => useResourceViewProps({ view: listOnly, filter: { practice_id: "p1" } }), {
      wrapper: wrap(provider()),
    });
    expect(result.current.allowCreate).toBe(false);
    expect(result.current.allowEdit).toBe(false);
  });

  it("shows a timestamp under the date hint as its day on the viewer's clock, not its UTC day", async () => {
    localStorage.clear();
    const dated = defineView(brands, { fields: { updated_at: { display: "date" } }, columns: { default: ["name", "updated_at"] } });
    const p = provider();
    p.getList = vi.fn(async () => ({ data: [{ ...ROWS[0]!, updated_at: "2026-01-03T03:00:00Z" }], total: 1 })) as DataProvider["getList"];
    render(<ResourceView view={dated} mode="table" detail="none" />, { wrapper: wrap(p) });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    // 7pm on Jan 2 in Los Angeles.
    expect(within(row).getByText(/Jan 2, 2026/)).toBeTruthy();
  });

  it("starts a create at the screen's defaults without filtering the list; the filter wins", async () => {
    localStorage.clear();
    const p = provider();
    const getList = vi.spyOn(p, "getList");
    const { result } = renderHook(
      () => useResourceViewProps({ view, filter: { practice_id: "p1" }, defaults: { practice_id: "p2", name: "Untitled", nope: 1 } as never }),
      { wrapper: wrap(p) },
    );
    const fields = result.current.formFields!;
    // A shown field starts at the value; a hidden one is create-only; the filter wins a clash.
    expect(fields.find((f) => f.key === "name")).toMatchObject({ defaultValue: "Untitled" });
    expect(fields.filter((f) => f.hidden)).toEqual([{ key: "practice_id", type: "hidden", hidden: true, readOnlyOnEdit: true, defaultValue: "p1" }]);
    expect(result.current.resourceOptions?.defaultFilters).toEqual([{ field: "practice_id", operator: "eq", value: "p1" }]);
    expect(getList).not.toHaveBeenCalled();
    // Defaults alone never reach the list request.
    const listed = provider();
    const listSpy = vi.spyOn(listed, "getList");
    render(<ResourceView view={view} defaults={{ practice_id: "p2" }} mode="table" detail="none" />, { wrapper: wrap(listed) });
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    for (const [, params] of listSpy.mock.calls) {
      expect(JSON.stringify(params.filters ?? [])).not.toContain("p2");
    }
  });

  it("reads a timestamp on the ViewerScope's clock when the column has none", async () => {
    localStorage.clear();
    const dated = defineView(brands, { fields: { updated_at: { display: "date" } }, columns: { default: ["name", "updated_at"] } });
    const p = provider();
    p.getList = vi.fn(async () => ({ data: [{ ...ROWS[0]!, updated_at: "2026-01-03T03:00:00Z" }], total: 1 })) as DataProvider["getList"];
    const Base = wrap(p);
    render(<ResourceView view={dated} mode="table" detail="none" />, {
      wrapper: ({ children }) => (
        <Base>
          <ViewerScope viewer="u1" timeZone="Asia/Tokyo">
            {children}
          </ViewerScope>
        </Base>
      ),
    });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    // Noon on Jan 3 in Tokyo, though the browser here is in Los Angeles (still Jan 2).
    expect(within(row).getByText(/Jan 3, 2026/)).toBeTruthy();
  });

  it.each([
    ["scope", "Asia/Tokyo", /Jan 3, 2026/],
    ["viewer", "Asia/Tokyo", /Jan 2, 2026/],
  ] as const)('reads a `timeZone: "%s"` column on ViewerScope\'s matching clock', async (clock, scopeZone, day) => {
    localStorage.clear();
    const dated = defineView(brands, {
      fields: { updated_at: { display: "date", timeZone: clock } },
      columns: { default: ["name", "updated_at"] },
    });
    const p = provider();
    // 03:00 UTC on Jan 3: still Jan 2 in Los Angeles (the viewer), already Jan 3 in Tokyo (the scope).
    const at = "2026-01-03T03:00:00Z";
    p.getList = vi.fn(async () => ({ data: [{ ...ROWS[0]!, updated_at: at }], total: 1 })) as DataProvider["getList"];
    const Base = wrap(p);
    render(<ResourceView view={dated} mode="table" detail="none" />, {
      wrapper: ({ children }) => (
        <Base>
          <ViewerScope viewer="u1" timeZone="America/Los_Angeles" scopeTimeZone={scopeZone}>
            {children}
          </ViewerScope>
        </Base>
      ),
    });
    const row = (await screen.findByText("Northwind")).closest("tr")!;
    expect(within(row).getByText(day)).toBeTruthy();
  });

  it("keeps a URL sort on a field column in cursor mode", async () => {
    localStorage.clear();
    const p = provider();
    p.getList = vi.fn(async () => ({ data: ROWS, total: 2, nextCursor: null })) as DataProvider["getList"];
    renderHook(
      () =>
        useResourceView({
          view,
          pagination: "cursor",
          urlState: { searchParams: new URLSearchParams("sort=name:desc"), setSearchParams: () => {} },
        }),
      { wrapper: wrap(p) },
    );
    await waitFor(() => expect(vi.mocked(p.getList).mock.calls.length).toBeGreaterThan(0));
    expect((vi.mocked(p.getList).mock.calls[0]![1] as ListParams).sort).toEqual({ field: "name", order: "desc" });
  });
});

describe("DateCell", () => {
  it("shows a calendar day as that day west of UTC", () => {
    expect(DateCell({ relative: false })(null, "2026-01-02")).toBe("Jan 2, 2026");
  });
});

describe("ResourceView words: resource name, then contract, then view copy, then screen", () => {
  type Goal = { id: string; title: string; due_on: string | null };
  const fields = [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "due_on", type: "datetime", dbType: "date", nullable: true },
  ] as const;
  const bare = defineResource<Goal>()({ name: "public.my_goals", key: "id", fields });
  const named = defineResource<Goal>()({ name: "public.my_goals", key: "id", noun: "goal", fields });
  const goals = (n: number): DataProvider => ({
    ...provider(),
    getList: vi.fn(async () => {
      const rows = Array.from({ length: n }, (_, i) => ({ id: `g${i}`, title: `Goal ${i}`, due_on: null }));
      return { data: rows, total: rows.length };
    }) as DataProvider["getList"],
  });
  const openForm = async () => {
    fireEvent.click(await screen.findByRole("button", { name: /New/ }));
    return screen.findByRole("dialog");
  };

  it("counts and titles the form with the contract's noun", async () => {
    localStorage.clear();
    const v = defineView(named, { form: ["title", "due_on"] });
    const { unmount } = render(<ResourceView view={v} mode="table" detail="none" />, { wrapper: wrap(goals(1)) });
    expect(await screen.findByText("1 goal")).toBeTruthy();
    expect(within(await openForm()).getByText("New goal")).toBeTruthy();
    unmount();
    render(<ResourceView view={v} mode="table" detail="none" />, { wrapper: wrap(goals(2)) });
    expect(await screen.findByText("2 goals")).toBeTruthy();
  });

  it("falls back to the resource name without one", async () => {
    localStorage.clear();
    const v = defineView(bare, { form: ["title"] });
    render(<ResourceView view={v} mode="table" detail="none" />, { wrapper: wrap(goals(1)) });
    expect(await screen.findByText("1 my goal")).toBeTruthy();
    expect(within(await openForm()).getByText("New my goal")).toBeTruthy();
  });

  it("lets the view's copy override the contract, and the screen override the view", async () => {
    localStorage.clear();
    const v = defineView(named, {
      form: ["title"],
      copy: { nounPlural: "targets", count: { one: "{count} target" }, form: { createTitle: "Set a {noun}" } },
    });
    const { unmount } = render(<ResourceView view={v} mode="table" detail="none" />, { wrapper: wrap(goals(1)) });
    expect(await screen.findByText("1 target")).toBeTruthy();
    expect(within(await openForm()).getByText("Set a goal")).toBeTruthy();
    unmount();
    render(<ResourceView view={v} mode="table" detail="none" formTitles={{ create: "Add one" }} />, { wrapper: wrap(goals(3)) });
    expect(await screen.findByText("3 targets")).toBeTruthy();
    expect(within(await openForm()).getByText("Add one")).toBeTruthy();
  });

  it("marks the form's fields nullable and defaulted from the contract", () => {
    const v = defineView(named, { form: ["title", "due_on"] });
    const { result } = renderHook(() => useResourceViewProps({ view: v }), { wrapper: wrap(provider()) });
    expect(result.current.formFields!.find((f) => f.key === "due_on")).toMatchObject({ nullable: true });
    expect(result.current.formFields!.find((f) => f.key === "title")!.nullable).toBeUndefined();
  });
});

describe("ResourceView list filters", () => {
  it("sends a list as `in`, and never starts a new row from it", async () => {
    localStorage.clear();
    const p = provider();
    const getList = vi.spyOn(p, "getList");
    const { result } = renderHook(() => useResourceViewProps({ view, filter: { status: ["active", "archived"], practice_id: "p1" } }), {
      wrapper: wrap(p),
    });
    expect(result.current.resourceOptions?.defaultFilters).toEqual([
      { field: "status", operator: "in", value: ["active", "archived"] },
      { field: "practice_id", operator: "eq", value: "p1" },
    ]);
    const fields = result.current.formFields!;
    expect(fields.find((f) => f.key === "status")!.defaultValue).toBeUndefined();
    expect(fields.filter((f) => f.hidden).map((f) => f.key)).toEqual(["practice_id"]);
    render(<ResourceView view={view} filter={{ status: ["archived"] }} mode="table" detail="none" />, { wrapper: wrap(p) });
    await waitFor(() => expect(getList).toHaveBeenCalled());
    expect(getList.mock.calls.at(-1)![1].filters).toContainEqual({ field: "status", operator: "in", value: ["archived"] });
  });
});
