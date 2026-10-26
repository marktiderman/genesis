// @feat:native-components
/**
 * NativeResourceWorkspace: one record's screen from a genesis-core workspace, natively.
 * - the title and the header menu come from getNativeResourceWorkspaceStackOptions;
 * - up to four sections are a segmented control, more are pushed rows;
 * - a list section is an embedded NativeResourceView filtered by the row;
 * - a settings section saves only its changed listed keys; a zero-row save is a refusal, inline;
 * - readiness is a group of checks with their tones.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type ListParams } from "@marktiderman/genesis-core";
import { defineView, defineWorkspace } from "@marktiderman/genesis-core/resource-view";
import { getNativeResourceWorkspaceStackOptions, NativeResourceWorkspace, NativeResourceWorkspaceMenu } from "..";

type Brand = { id: string; name: string; website: string | null; public: boolean; is_default: boolean };
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
const productsView = defineView(products);

const sections = [
  { id: "products", label: "Products", list: { view: productsView, filter: (b: Brand) => ({ brand_id: b.id }) } },
  { id: "settings", label: "Settings", settings: ["website", "public"] as const },
  { id: "activity", label: "Activity" },
];
const workspace = defineWorkspace(brandsView, {
  sections,
  readiness: (b) => [
    { title: "Has a website", ok: !!b.website, reason: "Add the website.", tone: "danger" },
    { title: "Has a name", ok: !!b.name },
  ],
});

const brand: Brand = { id: "b1", name: "Northwind", website: null, public: false, is_default: true };

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

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

beforeEach(() => vi.restoreAllMocks());

describe("NativeResourceWorkspace", () => {
  it("puts the title in the navigation bar and the actions in the header menu", () => {
    const options = getNativeResourceWorkspaceStackOptions({ workspace, row: brand });
    expect(options.title).toBe("Northwind");
    expect(typeof options.headerRight).toBe("function");
    const none = defineWorkspace(brandsView, { header: { actions: [] }, sections: [{ id: "a", label: "A" }] });
    expect(getNativeResourceWorkspaceStackOptions({ workspace: none, row: brand }).headerRight).toBeUndefined();
  });

  it("the menu lists actions; a refused one explains, a confirm asks, then the provider runs it", async () => {
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    const p = provider();
    render(<NativeResourceWorkspaceMenu workspace={workspace} row={brand} />, { wrapper: wrap(p) });
    fireEvent.click(screen.getByTestId("native-resource-workspace-menu"));
    const buttons = alert.mock.calls[0]![2]!;
    expect(buttons.map((b) => b.text)).toEqual(["Archive (The default brand stays.)", "Publish", "Cancel"]);
    buttons[0]!.onPress!();
    expect(alert).toHaveBeenLastCalledWith("Archive", "The default brand stays.");
    buttons[1]!.onPress!();
    await waitFor(() => expect(p.runAction).toHaveBeenCalledWith("brands", { id: "b1", action: "publish" }));

    alert.mockClear();
    const onAction = vi.fn();
    render(<NativeResourceWorkspaceMenu workspace={workspace} row={{ ...brand, is_default: false }} onAction={onAction} testID="menu2" />, {
      wrapper: wrap(provider()),
    });
    fireEvent.click(screen.getByTestId("menu2"));
    alert.mock.calls[0]![2]![0]!.onPress!();
    const [title, , confirm] = alert.mock.calls[1]!;
    expect(title).toBe("Archive this brand?");
    expect(onAction).not.toHaveBeenCalled();
    confirm![1]!.onPress!();
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("archive", { ...brand, is_default: false }));
  });

  it("shows up to four sections as a segmented control, and the readiness checks", () => {
    render(<NativeResourceWorkspace workspace={workspace} row={brand} section="activity" slots={{ activity: <></> }} switcher={<></>} />, {
      wrapper: wrap(provider()),
    });
    const control = screen.getByTestId("native-resource-workspace-sections");
    expect(within(control).getByTestId("native-resource-workspace-sections-option-settings")).toBeTruthy();
    expect(screen.getByTestId("native-resource-workspace-readiness").textContent).toBe("1 problem to fix");
    expect(screen.getByTestId("native-resource-workspace-check-0-chip").textContent).toBe("To do");
    expect(screen.getByText("Add the website.")).toBeTruthy();
    expect(screen.getByTestId("native-resource-workspace-check-1-chip").textContent).toBe("Done");
  });

  it("shows the summary chip alone once every check is met", () => {
    render(<NativeResourceWorkspace workspace={workspace} row={{ ...brand, website: "https://x.example" }} section="activity" readinessLabels={{ ready: "Ready to go" }} />, {
      wrapper: wrap(provider()),
    });
    expect(screen.getByTestId("native-resource-workspace-readiness").textContent).toBe("Ready to go");
    expect(screen.queryByTestId("native-resource-workspace-checks")).toBeNull();
  });

  it("pushes sections when there are more than four", () => {
    const wide = defineWorkspace(brandsView, {
      sections: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id.toUpperCase() })),
    });
    const onOpenSection = vi.fn();
    render(<NativeResourceWorkspace workspace={wide} row={brand} onOpenSection={onOpenSection} />, { wrapper: wrap(provider()) });
    expect(screen.queryByTestId("native-resource-workspace-sections-option-a")).toBeNull();
    fireEvent.click(screen.getByTestId("native-resource-workspace-section-e"));
    expect(onOpenSection).toHaveBeenCalledWith("e");
  });

  it("draws a list section as an embedded NativeResourceView filtered by the row", async () => {
    const p = provider();
    render(<NativeResourceWorkspace workspace={workspace} row={brand} />, { wrapper: wrap(p) });
    expect(await screen.findByText("Kettle")).toBeTruthy();
    const params = (p.getList as ReturnType<typeof vi.fn>).mock.calls[0]![1] as ListParams;
    expect(params.filters).toContainEqual({ field: "brand_id", operator: "eq", value: "b1" });
  });

  it("switches sections and saves only the changed listed keys", async () => {
    const p = provider();
    const onSaved = vi.fn();
    render(<NativeResourceWorkspace workspace={workspace} row={brand} onSaved={onSaved} />, { wrapper: wrap(p) });
    fireEvent.click(screen.getByTestId("native-resource-workspace-sections-option-settings"));
    const input = screen.getByTestId("native-resource-workspace-settings-website-input");
    fireEvent.change(input, { target: { value: "https://northwind.example" } });
    fireEvent.click(screen.getByTestId("native-resource-workspace-settings-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("brands", { id: "b1", data: { website: "https://northwind.example" } }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("shows a zero-row save as a refusal, inline", async () => {
    const p = provider({ update: vi.fn(async () => ({ data: null })) as unknown as DataProvider["update"] });
    render(<NativeResourceWorkspace workspace={workspace} row={brand} section="settings" />, { wrapper: wrap(p) });
    fireEvent.change(screen.getByTestId("native-resource-workspace-settings-website-input"), { target: { value: "https://x.example" } });
    fireEvent.click(screen.getByTestId("native-resource-workspace-settings-save"));
    expect((await screen.findByTestId("native-resource-workspace-settings-refusal")).textContent).toContain("This brand was not changed.");
  });
});
