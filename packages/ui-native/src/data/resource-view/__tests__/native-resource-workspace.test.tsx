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
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type ListParams } from "@marktiderman/genesis-core";
import { defineView, defineWorkspace } from "@marktiderman/genesis-core/resource-view";
import { getNativeResourceWorkspaceStackOptions, NativeResourceWorkspace, NativeResourceWorkspaceMenu, parseSettingNumber } from "..";

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
    { name: "purge", label: "Purge", destructive: true },
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

beforeEach(() => {
  vi.restoreAllMocks();
  // The react-native mock's Alert and ActionSheetIOS are module-level fns: start each test clean.
  (Alert.alert as unknown as { mockClear: () => void }).mockClear();
  (ActionSheetIOS.showActionSheetWithOptions as unknown as { mockClear: () => void }).mockClear();
});

describe("NativeResourceWorkspace", () => {
  it("puts the title in the navigation bar and the actions in the header menu", () => {
    const options = getNativeResourceWorkspaceStackOptions({ workspace, row: brand });
    expect(options.title).toBe("Northwind");
    expect(typeof options.headerRight).toBe("function");
    const none = defineWorkspace(brandsView, { header: { actions: [] }, sections: [{ id: "a", label: "A" }] });
    expect(getNativeResourceWorkspaceStackOptions({ workspace: none, row: brand }).headerRight).toBeUndefined();
  });

  it("iOS: the menu is an action sheet; a refused action explains, a confirm asks, then the provider runs it", async () => {
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    const sheet = vi.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
    const p = provider();
    render(<NativeResourceWorkspaceMenu workspace={workspace} row={brand} />, { wrapper: wrap(p) });
    fireEvent.click(screen.getByTestId("native-resource-workspace-menu"));
    const [options, pick] = sheet.mock.calls[0]!;
    expect(options.options).toEqual(["Archive (The default brand stays.)", "Publish", "Purge", "Cancel"]);
    expect(options.cancelButtonIndex).toBe(3);
    expect(options.destructiveButtonIndex).toEqual([2]);
    pick(0);
    expect(alert).toHaveBeenLastCalledWith("Archive", "The default brand stays.");
    pick(1);
    await waitFor(() => expect(p.runAction).toHaveBeenCalledWith("brands", { id: "b1", action: "publish" }));

    alert.mockClear();
    const onAction = vi.fn();
    render(<NativeResourceWorkspaceMenu workspace={workspace} row={{ ...brand, is_default: false }} onAction={onAction} testID="menu2" />, {
      wrapper: wrap(provider()),
    });
    fireEvent.click(screen.getByTestId("menu2"));
    sheet.mock.calls.at(-1)![1](0);
    const [title, , confirm] = alert.mock.calls[0]!;
    expect(title).toBe("Archive this brand?");
    expect(confirm!.length).toBe(2);
    expect(onAction).not.toHaveBeenCalled();
    confirm![1]!.onPress!();
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("archive", { ...brand, is_default: false }));
  });

  it("Android: the menu is a sheet of rows, never an alert with too many buttons", async () => {
    const os = Platform.OS;
    Platform.OS = "android";
    const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    try {
      const p = provider();
      render(<NativeResourceWorkspaceMenu workspace={workspace} row={{ ...brand, is_default: false }} />, { wrapper: wrap(p) });
      fireEvent.click(screen.getByTestId("native-resource-workspace-menu"));
      expect(alert).not.toHaveBeenCalled();
      expect((await screen.findByTestId("native-resource-workspace-menu-purge")).textContent).toContain("Purge");
      fireEvent.click(screen.getByTestId("native-resource-workspace-menu-publish"));
      await waitFor(() => expect(p.runAction).toHaveBeenCalledTimes(1));
    } finally {
      Platform.OS = os;
    }
  });

  it("runs one action at a time", async () => {
    let finish!: () => void;
    const runAction = vi.fn(() => new Promise<{ data: null }>((resolve) => (finish = () => resolve({ data: null }))));
    const sheet = vi.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
    render(<NativeResourceWorkspaceMenu workspace={workspace} row={brand} />, { wrapper: wrap(provider({ runAction: runAction as never })) });
    fireEvent.click(screen.getByTestId("native-resource-workspace-menu"));
    const pick = sheet.mock.calls[0]![1];
    pick(1);
    pick(1);
    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("native-resource-workspace-menu").getAttribute("aria-disabled")).toBe("true"));
    finish();
    await waitFor(() => expect(screen.getByTestId("native-resource-workspace-menu").getAttribute("aria-disabled")).not.toBe("true"));
  });

  it("names accessibility actions with a prefix, so 'activate' can't take over the button", async () => {
    const view = defineView(brands, { actions: [{ name: "activate", label: "Activate" }] });
    const ws = defineWorkspace(view, { sections: [{ id: "a", label: "A" }] });
    const p = provider();
    render(<NativeResourceWorkspaceMenu workspace={ws} row={brand} />, { wrapper: wrap(p) });
    const button = screen.getByTestId("native-resource-workspace-menu");
    expect(button.getAttribute("data-a11y-actions")).toBe("action:activate");
    // The platform's own "activate" does nothing here; the prefixed one runs the action.
    button.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "activate" }));
    expect(p.runAction).not.toHaveBeenCalled();
    button.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "action:activate" }));
    await waitFor(() => expect(p.runAction).toHaveBeenCalledWith("brands", { id: "b1", action: "activate" }));
  });

  it("hides actions when nothing can run them, or the screen turns them off", () => {
    render(<NativeResourceWorkspaceMenu workspace={workspace} row={brand} testID="none" />, { wrapper: wrap(provider({ runAction: undefined })) });
    expect(screen.queryByTestId("none")).toBeNull();
    const sheet = vi.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
    render(<NativeResourceWorkspaceMenu workspace={workspace} row={brand} can={(name) => name !== "publish"} />, { wrapper: wrap(provider()) });
    fireEvent.click(screen.getByTestId("native-resource-workspace-menu"));
    expect(sheet.mock.calls.at(-1)![0].options).not.toContain("Publish");
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
    render(<NativeResourceWorkspace workspace={workspace} row={{ ...brand, website: "https://x.example" }} section="activity" messages={{ ready: "Ready to go" }} />, {
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

describe("NativeResourceWorkspace review fixes", () => {
  const locking = defineWorkspace(
    defineView(brands, {
      fields: { website: { visible: (v) => v["public"] === true } },
      can: { update: (b) => (b.is_default ? "Locked." : true) },
    }),
    { sections: [{ id: "settings", label: "Settings", settings: ["public", "website", "name"] }] },
  );

  it("shows settings read-only with the reason when the view refuses update", () => {
    render(<NativeResourceWorkspace workspace={locking} row={brand} />, { wrapper: wrap(provider()) });
    expect(screen.getByTestId("native-resource-workspace-settings-locked").textContent).toContain("Locked.");
    expect(screen.queryByTestId("native-resource-workspace-settings-save")).toBeNull();
  });

  it("leaves a field hidden by `visible` out of the save", async () => {
    const p = provider();
    render(<NativeResourceWorkspace workspace={locking} row={{ ...brand, is_default: false, public: true }} />, { wrapper: wrap(p) });
    fireEvent.change(screen.getByTestId("native-resource-workspace-settings-website-input"), { target: { value: "https://x.example" } });
    fireEvent.change(screen.getByTestId("native-resource-workspace-settings-name-input"), { target: { value: "Southwind" } });
    fireEvent.click(screen.getByTestId("native-resource-workspace-settings-public-input"));
    expect(screen.queryByTestId("native-resource-workspace-settings-website-input")).toBeNull();
    fireEvent.click(screen.getByTestId("native-resource-workspace-settings-save"));
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("brands", { id: "b1", data: { public: false, name: "Southwind" } }));
  });

  it("opens a section in place with a way back when there are more than four and no onOpenSection", () => {
    const wide = defineWorkspace(brandsView, { sections: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id.toUpperCase() })) });
    render(<NativeResourceWorkspace workspace={wide} row={brand} slots={{ e: <p>Section E</p> }} />, { wrapper: wrap(provider()) });
    fireEvent.click(screen.getByTestId("native-resource-workspace-section-e"));
    expect(screen.getByText("Section E")).toBeTruthy();
    fireEvent.click(screen.getByTestId("native-resource-workspace-all-sections"));
    expect(screen.getByTestId("native-resource-workspace-section-a")).toBeTruthy();
  });

  it("parses a number as typed, comma decimals too, never NaN", () => {
    expect(parseSettingNumber("1.5")).toBe(1.5);
    expect(parseSettingNumber("1,50")).toBe(1.5);
    expect(parseSettingNumber(" -2 ")).toBe(-2);
    expect(parseSettingNumber("1,5,0")).toBeNull();
    expect(parseSettingNumber("abc")).toBeNull();
    expect(parseSettingNumber("")).toBeNull();
  });
});
