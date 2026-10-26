/**
 * ResourceWorkspace: one record's screen from a genesis-core workspace, inside the AppShell.
 * - the header (title, actions with guards, a switcher) goes into the page header;
 * - sections become the shell's tabs; a list section is an embedded ResourceView filtered by the row;
 * - a settings section saves only its listed keys, and a zero-row save is a refusal shown inline;
 * - readiness shows as the readiness chip.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type ListParams } from "@marktiderman/genesis-core";
import { defineView, defineWorkspace } from "@marktiderman/genesis-core/resource-view";
import { AppShell, type NavItem } from "../../layout/AppShell";
import type { NavigationNode } from "../../../navigation";
import { ResourceWorkspace } from "../resource-view";

type Brand = { id: string; name: string; website: string | null; public: boolean; is_default: boolean; notes: string | null };
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
  ],
});
const productsView = defineView(products, { columns: { default: ["title"] } });

const workspace = defineWorkspace(brandsView, {
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

function renderWorkspace(section: string, p: DataProvider, extra: Partial<Parameters<typeof ResourceWorkspace>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return render(
    <GenesisProvider provider={p} queryClient={queryClient}>
      <AppShell
        appName="Test"
        navigation={tree}
        options={{ showThemeToggle: false, configurable: false, subNav: "tabs" }}
        activePath={`/brands/b1/${section}`}
      >
        <ResourceWorkspace
          workspace={workspace as never}
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

describe("ResourceWorkspace", () => {
  it("puts the header in the page header: title, switcher, guarded actions", () => {
    renderWorkspace("activity", provider());
    const header = within(screen.getByTestId("app-shell-page-header"));
    expect(header.getByRole("heading", { name: "Northwind" })).toBeTruthy();
    expect(header.getByRole("button", { name: "Switch brand" })).toBeTruthy();
    const archive = header.getByTestId("resource-workspace-action-archive") as HTMLButtonElement;
    expect(archive.disabled).toBe(true);
    expect(archive.getAttribute("title")).toBe("The default brand stays.");
    expect((header.getByTestId("resource-workspace-action-publish") as HTMLButtonElement).disabled).toBe(false);
  });

  it("registers the sections as the shell's tabs, and fills a slot section", () => {
    renderWorkspace("activity", provider());
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
    renderWorkspace("products", p);
    expect(await screen.findByText("Kettle")).toBeTruthy();
    const params = (p.getList as ReturnType<typeof vi.fn>).mock.calls[0]![1] as ListParams;
    expect(params.filters).toContainEqual({ field: "brand_id", operator: "eq", value: "b1" });
    // Embedded: it never claims the page header.
    expect(within(screen.getByTestId("app-shell-page-header")).queryByText("Products")).toBeNull();
  });

  it("saves only the settings section's changed keys", async () => {
    const p = provider();
    const onSaved = vi.fn();
    renderWorkspace("settings", p, { onSaved });
    const save = screen.getByTestId("resource-workspace-settings-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("resource-workspace-settings-website-input"), { target: { value: "https://northwind.example" } });
    fireEvent.click(screen.getByTestId("resource-workspace-settings-public-input"));
    fireEvent.click(save);
    await waitFor(() => expect(p.update).toHaveBeenCalledTimes(1));
    expect(p.update).toHaveBeenCalledWith("brands", { id: "b1", data: { website: "https://northwind.example", public: true } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("shows a zero-row save as a refusal, inline", async () => {
    const p = provider({ update: vi.fn(async () => ({ data: null })) as unknown as DataProvider["update"] });
    renderWorkspace("settings", p);
    fireEvent.click(screen.getByTestId("resource-workspace-settings-public-input"));
    fireEvent.click(screen.getByTestId("resource-workspace-settings-save"));
    expect((await screen.findByTestId("resource-workspace-settings-error")).textContent).toBe("This brand was not changed.");
  });

  it("shows readiness as the chip, and the checks on click", () => {
    renderWorkspace("activity", provider());
    const chip = screen.getByTestId("readiness");
    expect(chip.textContent).toBe("1 problem to fix");
    fireEvent.click(chip);
    expect(screen.getByText("Add the website.")).toBeTruthy();
    expect(screen.getByTestId("resource-workspace-check-todo")).toBeTruthy();
    expect(screen.getByTestId("resource-workspace-check-ok")).toBeTruthy();
  });

  it("runs an allowed action through the provider; a confirm asks first", async () => {
    const p = provider();
    renderWorkspace("activity", p);
    fireEvent.click(screen.getByTestId("resource-workspace-action-publish"));
    await waitFor(() => expect(p.runAction).toHaveBeenCalledWith("brands", { id: "b1", action: "publish" }));

    const onAction = vi.fn();
    const q = provider();
    renderWorkspace("activity", q, { row: { ...brand, is_default: false }, onAction });
    const archive = screen.getAllByTestId("resource-workspace-action-archive").at(-1)!;
    fireEvent.click(archive);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText("Archive this brand?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("resource-workspace-confirm"));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("archive", { ...brand, is_default: false }));
  });
});
