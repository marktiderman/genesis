/**
 * RecordView: one record's screen from a genesis-core page, inside the AppShell.
 * - the header (title, actions with guards, a switcher) goes into the page header;
 * - sections become the shell's tabs; a list section is an embedded ResourceView filtered by the row;
 * - a settings section saves only its listed keys, and a zero-row save is a refusal shown inline;
 * - readiness shows as the readiness chip.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataWriteError, defineResource, GenesisProvider, ViewerScope, type DataProvider, type ListParams, type Viewer } from "@marktiderman/genesis-core";
import { defineView, defineRecordView } from "@marktiderman/genesis-core/resource-view";
import { AppShell, type NavItem } from "../../layout/AppShell";
import type { NavigationNode } from "../../../navigation";
import { RecordView } from "../resource-view";

type Brand = { id: string; name: string; website: string | null; public: boolean; is_default: boolean; notes: string | null; score?: number | null };
type Product = { id: string; brand_id: string; title: string };

const brands = defineResource<Brand>()({
  name: "brands",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "website", type: "string", widget: "url", nullable: true },
    { name: "public", type: "boolean", hasDefault: true },
    { name: "is_default", type: "boolean", hasDefault: true },
    { name: "notes", type: "string", nullable: true },
    { name: "score", type: "number", nullable: true },
  ],
});
const products = defineResource<Product>()({
  name: "products",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "brand_id", type: "string" },
    { name: "title", type: "string" },
  ],
});

const brandsView = defineView(brands, {
  actions: [
    { name: "archive", label: "Archive", confirm: "Archive this brand?", can: (b) => (b.is_default ? "The default brand stays." : true) },
    { name: "publish", label: "Publish" },
    { name: "purge", label: "Purge", destructive: true },
  ],
});
const productsView = defineView(products, { columns: { default: ["title"] } });

const page = defineRecordView(brandsView, {
  sections: [
    { id: "products", label: "Products", list: { view: productsView, filter: (b) => ({ brand_id: b.id }) } },
    { id: "settings", label: "Settings", settings: ["website", "public"] },
    { id: "activity", label: "Activity" },
  ],
  readiness: (b) => [
    { title: "Has a website", ok: !!b.website, reason: "Add the website.", tone: "danger" },
    { title: "Has a name", ok: !!b.name },
  ],
});

const brand: Brand = { id: "b1", name: "Northwind", website: null, public: false, is_default: true, notes: "keep" };

const tree: NavigationNode<NavItem> = {
  id: "app",
  path: "/",
  label: "Home",
  items: [{ to: "/brands", label: "Brands" }],
  children: [
    {
      id: "brands",
      path: "/brands",
      label: "Brands",
      items: [],
      children: [{ id: "brand", path: "/brands/$brandId", label: "Brand", items: [] }],
    },
  ],
};

function provider(over: Partial<DataProvider> = {}): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: [{ id: "p1", brand_id: "b1", title: "Kettle" }], total: 1 })) as DataProvider["getList"],
    getOne: vi.fn(async () => ({ data: brand })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { ...brand, id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
    runAction: vi.fn(async () => ({ data: brand })),
    ...over,
  };
}

function renderRecordView(section: string, p: DataProvider, extra: Partial<Parameters<typeof RecordView>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return render(
    <GenesisProvider provider={p} queryClient={queryClient}>
      <AppShell
        appName="Test"
        navigation={tree}
        options={{ showThemeToggle: false, configurable: false, subNav: "tabs" }}
        activePath={`/brands/b1/${section}`}
      >
        <RecordView
          view={page as never}
          row={brand}
          section={section}
          sectionHref={(id) => `/brands/b1/${id}`}
          switcher={<button type="button">Switch brand</button>}
          slots={{ activity: <p>Activity feed</p> }}
          {...extra}
        />
      </AppShell>
    </GenesisProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("RecordView", () => {
  it("puts the header in the page header: title, switcher, guarded actions", () => {
    renderRecordView("activity", provider());
    const header = within(screen.getByTestId("app-shell-page-header"));
    expect(header.getByRole("heading", { name: "Northwind" })).toBeTruthy();
    expect(header.getByRole("button", { name: "Switch brand" })).toBeTruthy();
    const archive = header.getByTestId("resource-workspace-action-archive") as HTMLButtonElement;
    expect(archive.disabled).toBe(true);
    expect(archive.getAttribute("title")).toBe("The default brand stays.");
    expect((header.getByTestId("resource-workspace-action-publish") as HTMLButtonElement).disabled).toBe(false);
  });

  it("registers the sections as the shell's tabs, and fills a slot section", () => {
    renderRecordView("activity", provider());
    const tabs = within(screen.getByTestId("app-shell-sub-nav"));
    expect(tabs.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Products", "/brands/b1/products"],
      ["Settings", "/brands/b1/settings"],
      ["Activity", "/brands/b1/activity"],
    ]);
    expect(screen.getByText("Activity feed")).toBeTruthy();
  });

  it("draws a list section as an embedded ResourceView filtered by the row", async () => {
    const p = provider();
    renderRecordView("products", p);
    expect(await screen.findByText("Kettle")).toBeTruthy();
    const params = (p.getList as ReturnType<typeof vi.fn>).mock.calls[0]![1] as ListParams;
    expect(params.filters).toContainEqual({ field: "brand_id", operator: "eq", value: "b1" });
    // Embedded: it never claims the page header.
    expect(within(screen.getByTestId("app-shell-page-header")).queryByText("Products")).toBeNull();
  });

  it("saves only the settings section's changed keys", async () => {
    const p = provider();
    const onSaved = vi.fn();
    renderRecordView("settings", p, { onSaved });
    const save = screen.getByTestId("resource-workspace-settings-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("resource-workspace-settings-website-input"), { target: { value: "https://northwind.example" } });
    fireEvent.click(screen.getByTestId("resource-workspace-settings-public-input"));
    fireEvent.click(save);
    await waitFor(() => expect(p.update).toHaveBeenCalledTimes(1));
    expect(p.update).toHaveBeenCalledWith("brands", { id: "b1", data: { website: "https://northwind.example", public: true } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("a conflict opens the conflict sheet; keep mine saves again at the new version", async () => {
    let calls = 0;
    const update = vi.fn(async (_r: string, params: { data: unknown }) => {
      calls += 1;
      if (calls === 1) {
        throw new DataWriteError("conflict", "Someone else changed this brand after you opened it.", {
          current: { id: "b1", name: "Northwind", website: "https://theirs.example", public: false, is_default: true },
          currentVersion: "7",
        });
      }
      return { data: { id: "b1", ...(params.data as object) } };
    });
    const p = provider({ update: update as unknown as DataProvider["update"] });
    renderRecordView("settings", p);
    fireEvent.change(screen.getByTestId("resource-workspace-settings-website-input"), { target: { value: "https://mine.example" } });
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    const sheet = await screen.findByTestId("resource-workspace-settings-conflict");
    expect(within(sheet).getByTestId("resource-workspace-settings-conflict-field-website").textContent).toMatch(/theirs\.example.*mine\.example/);
    fireEvent.click(within(sheet).getByTestId("resource-workspace-settings-conflict-keep-mine"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]![1]).toMatchObject({ data: { website: "https://mine.example" }, expectedVersion: "7" });
  });

  it("take theirs drops the section's edits", async () => {
    const update = vi.fn(async () => {
      throw new DataWriteError("conflict", "x", { current: { id: "b1", website: "https://theirs.example" }, currentVersion: "7" });
    });
    renderRecordView("settings", provider({ update: update as unknown as DataProvider["update"] }));
    fireEvent.change(screen.getByTestId("resource-workspace-settings-website-input"), { target: { value: "https://mine.example" } });
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    fireEvent.click(await screen.findByTestId("resource-workspace-settings-conflict-take-theirs"));
    await waitFor(() => expect(screen.queryByTestId("resource-workspace-settings-conflict")).toBeNull());
    expect((screen.getByTestId("resource-workspace-settings-website-input") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("resource-workspace-settings-error")).toBeNull();
  it("checks a settings save against the row the edit started on, not one that refreshed meanwhile", async () => {
    const versioned = (over: Partial<DataProvider> = {}) =>
      provider({
        capabilities: vi.fn(async () => ({
          search: false,
          sort: false,
          filterOperators: [],
          bulkWrites: false,
          versionedWrites: true,
          compositeKeys: false,
          version: { field: "version", kind: "integer" as const },
        })),
        ...over,
      });
    const p = versioned();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const at = (row: Brand & { version: number }) => (
      <GenesisProvider provider={p} queryClient={queryClient}>
        <RecordView view={page as never} row={row} section="settings" sectionHref={(id) => `/brands/b1/${id}`} />
      </GenesisProvider>
    );
    const { rerender } = render(at({ ...brand, is_default: false, version: 1 }));
    await waitFor(() => expect(p.capabilities).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("resource-workspace-settings-website-input"), { target: { value: "https://mine.example" } });
    // Someone else saves; this tab's row refreshes to v2 while the edit stays on screen.
    rerender(at({ ...brand, is_default: false, public: true, version: 2 }));
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalledTimes(1));
    expect((p.update as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toMatchObject({ expectedVersion: "1" });
  });

  it("shows a zero-row save as a refusal, inline", async () => {
    const p = provider({ update: vi.fn(async () => ({ data: null })) as unknown as DataProvider["update"] });
    renderRecordView("settings", p);
    fireEvent.click(screen.getByTestId("resource-workspace-settings-public-input"));
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    expect((await screen.findByTestId("resource-workspace-settings-error")).textContent).toBe("This brand was not changed.");
  });

  it("shows readiness as the chip, and the checks on click", () => {
    renderRecordView("activity", provider());
    const chip = screen.getByTestId("readiness");
    expect(chip.textContent).toBe("1 problem to fix");
    fireEvent.click(chip);
    expect(screen.getByText("Add the website.")).toBeTruthy();
    expect(screen.getByTestId("resource-workspace-check-todo")).toBeTruthy();
    expect(screen.getByTestId("resource-workspace-check-ok")).toBeTruthy();
  });

  it("runs an allowed action through the provider; a confirm asks first", async () => {
    const p = provider();
    renderRecordView("activity", p);
    fireEvent.click(screen.getByTestId("resource-workspace-action-publish"));
    await waitFor(() => expect(p.runAction).toHaveBeenCalledWith("brands", { id: "b1", action: "publish" }));

    const onAction = vi.fn();
    const q = provider();
    renderRecordView("activity", q, { row: { ...brand, is_default: false }, onAction });
    const archive = screen.getAllByTestId("resource-workspace-action-archive").at(-1)!;
    fireEvent.click(archive);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText("Archive this brand?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("resource-workspace-confirm"));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("archive", { ...brand, is_default: false }));
  });
});

describe("RecordView review fixes", () => {
  const second = defineRecordView(
    defineView(brands, {
      fields: { website: { visible: (v) => v["public"] === true } },
      can: { update: (b) => (b.is_default ? "Locked." : true) },
      actions: [{ name: "publish", label: "Publish" }, { name: "purge", label: "Purge", destructive: true }],
    }),
    { sections: [{ id: "settings", label: "Settings", settings: ["public", "website", "notes", "score"] }] },
  );
  const render2 = (r: Brand, p: DataProvider, extra: Record<string, unknown> = {}) =>
    renderRecordView("settings", p, { view: second as never, row: r, ...extra });

  it("shows settings read-only with the reason when the view refuses update", () => {
    const p = provider();
    render2(brand, p);
    expect(screen.getByTestId("resource-workspace-settings-locked").textContent).toBe("Locked.");
    expect(screen.queryByTestId("resource-workspace-settings-save")).toBeNull();
    expect((screen.getByTestId("resource-workspace-settings-notes-input") as HTMLInputElement).disabled).toBe(true);
  });

  it("leaves a field hidden by `visible` out of the save", async () => {
    const p = provider();
    render2({ ...brand, is_default: false, public: true }, p);
    fireEvent.change(screen.getByTestId("resource-workspace-settings-website-input"), { target: { value: "https://x.example" } });
    fireEvent.change(screen.getByTestId("resource-workspace-settings-notes-input"), { target: { value: "hello" } });
    // Turning public off hides the website: its edit is dropped.
    fireEvent.click(screen.getByTestId("resource-workspace-settings-public-input"));
    expect(screen.queryByTestId("resource-workspace-settings-website-input")).toBeNull();
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("brands", { id: "b1", data: { public: false, notes: "hello" } }));
  });

  it("never saves NaN from a number field", () => {
    render2({ ...brand, is_default: false }, provider());
    fireEvent.change(screen.getByTestId("resource-workspace-settings-score-input"), { target: { value: "1e" } });
    expect((screen.getByTestId("resource-workspace-settings-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides actions nothing can run, and those the screen turns off; styles destructive ones", () => {
    const { unmount } = render2(brand, provider({ runAction: undefined }));
    expect(screen.queryByTestId("resource-workspace-action-publish")).toBeNull();
    unmount();
    render2(brand, provider(), { can: (name: string) => (name === "publish" ? false : true) });
    expect(screen.queryByTestId("resource-workspace-action-publish")).toBeNull();
    expect(screen.getByTestId("resource-workspace-action-purge").className).toMatch(/destructive/);
  });

  it("hides actions the provider doesn't serve, when it says", async () => {
    render2(brand, provider({ describe: vi.fn(async () => ({ ...brands, access: {}, actions: [{ name: "purge", label: "Purge" }] })) as never }));
    await waitFor(() => expect(screen.queryByTestId("resource-workspace-action-publish")).toBeNull());
    expect(screen.getByTestId("resource-workspace-action-purge")).toBeTruthy();
  });
});

describe("RecordView when only the viewer's roles change", () => {
  const isEditor = (v?: Viewer) => ((v?.roles as { teamRoles?: readonly string[] } | undefined)?.teamRoles ?? []).includes("editor");
  const guarded = defineRecordView(
    defineView(brands, {
      can: { update: (_b, v) => (isEditor(v) ? true : "Only editors change brands.") },
      actions: [{ name: "publish", label: "Publish", can: (_b, v) => (isEditor(v) ? true : "Only editors publish.") }],
    }),
    { sections: [{ id: "settings", label: "Settings", settings: ["website", "notes"] }] },
  );

  // ViewerScope keeps the same viewer's screen mounted when the roles change, so the header's
  // action guards and the settings' update guard must be asked again with the new viewer.
  it("asks the action and settings guards again, without remounting", async () => {
    let mounts = 0;
    function Mounts() {
      useState(() => (mounts += 1));
      return null;
    }
    const p = provider();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const at = (roles?: { teamRoles: string[] }) => (
      <GenesisProvider provider={p} queryClient={queryClient}>
        <ViewerScope viewer="ann" roles={roles}>
          <Mounts />
          <AppShell
            appName="Test"
            navigation={tree}
            options={{ showThemeToggle: false, configurable: false, subNav: "tabs" }}
            activePath="/brands/b1/settings"
          >
            <RecordView view={guarded as never} row={brand} section="settings" sectionHref={(id) => `/brands/b1/${id}`} />
          </AppShell>
        </ViewerScope>
      </GenesisProvider>
    );
    const publish = () => screen.getByTestId("resource-workspace-action-publish") as HTMLButtonElement;
    const locked = () => screen.queryByTestId("resource-workspace-settings-locked");
    const notes = () => screen.getByTestId("resource-workspace-settings-notes-input") as HTMLInputElement;
    const save = () => screen.queryByTestId("resource-workspace-settings-save");

    // Roles not known yet: the action is refused with its reason, the settings are read-only.
    const { rerender } = render(at(undefined));
    expect(publish().disabled).toBe(true);
    expect(publish().title).toBe("Only editors publish.");
    expect(locked()?.textContent).toBe("Only editors change brands.");
    expect(notes().disabled).toBe(true);
    expect(save()).toBeNull();

    // Roles arrive (undefined → editor): the same mounted screen allows both.
    rerender(at({ teamRoles: ["editor"] }));
    await waitFor(() => expect(publish().disabled).toBe(false));
    expect(publish().title).not.toBe("Only editors publish.");
    expect(locked()).toBeNull();
    expect(notes().disabled).toBe(false);
    expect(save()).toBeTruthy();

    // Roles change (editor → reader): refused and read-only again, still the same mount.
    rerender(at({ teamRoles: ["reader"] }));
    await waitFor(() => expect(publish().disabled).toBe(true));
    expect(publish().title).toBe("Only editors publish.");
    expect(locked()?.textContent).toBe("Only editors change brands.");
    expect(notes().disabled).toBe(true);
    expect(save()).toBeNull();
    expect(mounts).toBe(1);
  });
});

describe("RecordView header, section icons and settings", () => {
  const summarized = defineRecordView(
    defineView(brands, {
      summary: (b) => ({
        title: b.name,
        subtitle: "B-1 · Retail",
        chips: [{ label: "Live", tone: "success" }, { label: "Partner" }, { label: "Featured", tone: "info" }],
      }),
    }),
    {
      sections: [
        { id: "settings", label: "Settings", settings: ["website", "notes", "score"] },
        { id: "activity", label: "Activity" },
      ],
    },
  );
  const editable = { ...brand, is_default: false };
  const renderSummarized = (extra: Partial<Parameters<typeof RecordView>[0]> = {}, p = provider()) =>
    renderRecordView("settings", p, { view: summarized as never, row: editable, ...extra });

  it("shows every summary chip and the subtitle in the header, the first chip as the status", () => {
    renderSummarized();
    const header = within(screen.getByTestId("app-shell-page-header"));
    expect(header.getByText("Live")).toBeTruthy();
    expect(header.getAllByTestId("resource-chip").map((c) => c.textContent)).toEqual(["Partner", "Featured"]);
    expect(header.getByText("B-1 · Retail")).toBeTruthy();
  });

  it("adds no chips or subtitle when the summary has none", () => {
    renderRecordView("activity", provider());
    const header = screen.getByTestId("app-shell-page-header");
    expect(within(header).queryAllByTestId("resource-chip")).toHaveLength(0);
    expect(header.querySelector('[data-slot="resource-header-subtitle"]')).toBeNull();
  });

  it("puts an icon on a section's tab when sectionIcons names one, and none otherwise", () => {
    const Icon = (props: Record<string, unknown>) => <svg data-testid="settings-icon" {...props} />;
    renderSummarized({ sectionIcons: { settings: Icon as never } });
    const [settings, activity] = within(screen.getByTestId("app-shell-sub-nav")).getAllByRole("link");
    expect(within(settings!).getByTestId("settings-icon")).toBeTruthy();
    expect(settings!.textContent).toBe("Settings");
    expect(activity!.querySelector("svg")).toBeNull();
  });

  it("settingsLocked narrows: the screen's reason makes the settings read-only", () => {
    renderSummarized({ settingsLocked: (id: string) => (id === "settings" ? "Only owners edit this." : null) });
    expect(screen.getByTestId("resource-workspace-settings-locked").textContent).toBe("Only owners edit this.");
    expect(screen.queryByTestId("resource-workspace-settings-save")).toBeNull();
  });

  it("sends only the fields edited, so a refreshed row's other values aren't overwritten", async () => {
    const p = provider();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const at = (row: Brand) => (
      <GenesisProvider provider={p} queryClient={queryClient}>
        <AppShell appName="Test" navigation={tree} options={{ showThemeToggle: false, configurable: false, subNav: "tabs" }} activePath="/brands/b1/settings">
          <RecordView view={summarized as never} row={row} section="settings" sectionHref={(id) => `/brands/b1/${id}`} />
        </AppShell>
      </GenesisProvider>
    );
    const { rerender } = render(at(editable));
    fireEvent.change(screen.getByTestId("resource-workspace-settings-notes-input"), { target: { value: "mine" } });
    // Someone else changes the website meanwhile; the refreshed row shows it.
    rerender(at({ ...editable, website: "https://theirs.example" }));
    expect((screen.getByTestId("resource-workspace-settings-website-input") as HTMLInputElement).value).toBe("https://theirs.example");
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("brands", { id: "b1", data: { notes: "mine" } }));
  });

  it('an edit back to the value the row holds (2 and "2") is no change', () => {
    renderSummarized({ row: { ...editable, score: 2 } });
    const score = screen.getByTestId("resource-workspace-settings-score-input");
    const save = () => screen.getByTestId("resource-workspace-settings-save") as HTMLButtonElement;
    fireEvent.change(score, { target: { value: "3" } });
    expect(save().disabled).toBe(false);
    fireEvent.change(score, { target: { value: "2" } });
    expect(save().disabled).toBe(true);
  });
});

describe("RecordView settings picker", () => {
  type Item = { id: string; name: string; size: "s" | "m" | null; kind: "a" | "b" };
  const items = defineResource<Item>()({
    name: "items",
    key: "id",
    labelField: "name",
    fields: [
      { name: "id", type: "string", hasDefault: true },
      { name: "name", type: "string" },
      { name: "size", type: "string", enumValues: ["s", "m"], nullable: true },
      { name: "kind", type: "string", enumValues: ["a", "b"] },
    ],
  });
  const itemPage = defineRecordView(defineView(items, {}), { sections: [{ id: "settings", label: "Settings", settings: ["size", "kind"] }] });
  const item: Item = { id: "i1", name: "Cup", size: "m", kind: "a" };
  const open = (testId: string) => {
    const trigger = screen.getByTestId(testId);
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.keyDown(trigger, { key: "Enter" });
  };

  it("offers None on a field that can be empty, and saves it as null", async () => {
    const p = provider({ update: vi.fn(async (_r, { id, data }) => ({ data: { ...item, id, ...(data as object) } })) as DataProvider["update"] });
    renderRecordView("settings", p, { view: itemPage as never, row: item });
    open("resource-workspace-settings-size-input");
    fireEvent.click(await screen.findByTestId("resource-workspace-settings-size-input-none"));
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("items", { id: "i1", data: { size: null } }));
  });

  it("offers no None on a field that must have a value", async () => {
    renderRecordView("settings", provider(), { view: itemPage as never, row: item });
    open("resource-workspace-settings-kind-input");
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(screen.queryByTestId("resource-workspace-settings-kind-input-none")).toBeNull();
  });

  it("offers no None on a nullable field the view requires", async () => {
    const requiredSize = {
      ...itemPage,
      settingsFields: (id: string) => itemPage.settingsFields(id).map((f) => (f.field.name === "size" ? { ...f, required: true } : f)),
    };
    renderRecordView("settings", provider(), { view: requiredSize as never, row: item });
    open("resource-workspace-settings-size-input");
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(screen.queryByTestId("resource-workspace-settings-size-input-none")).toBeNull();
  });
});

describe("RecordView settings inputs", () => {
  type Member = { id: string; name: string; phone: string | null; mobile: string | null; email: string | null };
  const members = defineResource<Member>()({
    name: "members",
    key: "id",
    labelField: "name",
    fields: [
      { name: "id", type: "string", hasDefault: true },
      { name: "name", type: "string" },
      { name: "phone", type: "string", nullable: true, widget: "tel" },
      // Named like a phone number, declared as nothing: stays text.
      { name: "mobile", type: "string", nullable: true },
      { name: "email", type: "string", nullable: true, widget: "email" },
    ],
  });
  const memberPage = defineRecordView(
    defineView(members, { fields: { phone: { autoComplete: "tel", enterKeyHint: "done" }, mobile: { inputMode: "numeric" } } }),
    { sections: [{ id: "settings", label: "Settings", settings: ["phone", "mobile", "email"] }] },
  );
  const member: Member = { id: "m1", name: "Ada", phone: null, mobile: null, email: null };

  it("gives a settings field the form's type, keyboard and autofill (widget: tel)", () => {
    renderRecordView("settings", provider({ getOne: vi.fn(async () => ({ data: member })) as DataProvider["getOne"] }), {
      view: memberPage as never,
      row: member as never,
    });
    const input = (key: string) => screen.getByTestId(`resource-workspace-settings-${key}-input`) as HTMLInputElement;
    expect(input("phone").type).toBe("tel");
    expect(input("phone").getAttribute("inputmode")).toBe("tel");
    expect(input("phone").getAttribute("autocomplete")).toBe("tel");
    expect(input("phone").getAttribute("enterkeyhint")).toBe("done");
    expect(input("mobile").type).toBe("text");
    // The view field's own keyboard wins.
    expect(input("mobile").getAttribute("inputmode")).toBe("numeric");
    expect(input("email").type).toBe("email");
    expect(input("email").getAttribute("inputmode")).toBe("email");
    // Autofill only where the view field asks for it.
    expect(input("email").hasAttribute("autocomplete")).toBe(false);
  });
});
