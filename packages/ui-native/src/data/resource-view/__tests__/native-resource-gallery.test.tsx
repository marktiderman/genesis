// @feat:media-gallery @feat:resource-view-gallery @feat:native-components
/**
 * NativeResourceView `mode="grid"` over a view's `gallery` block: a photo per row in
 * NativeGalleryGrid's justified rows (the web's layout, from genesis-core), in place of cards.
 * - a row without an image isn't drawn; a press opens the row (onRowPress, else the peek);
 * - list mode and a view without a gallery keep their cards and rows;
 * - a screen's `gallery` overrides the view's block, or adds one.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { NativeResourceView } from "..";

type Photo = { id: string; title: string; url: string | null; w: number | null; h: number | null; place: string };

const photos = defineResource<Photo>()({
  name: "photos",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "url", type: "string", nullable: true },
    { name: "w", type: "number", nullable: true },
    { name: "h", type: "number", nullable: true },
    { name: "place", type: "string" },
  ],
});

const ROWS: Photo[] = [
  { id: "p1", title: "Harbour", url: "https://example.test/p1.jpg", w: 1600, h: 900, place: "Bay" },
  { id: "p2", title: "Ridge", url: "https://example.test/p2.jpg", w: 900, h: 1200, place: "Hills" },
  { id: "p3", title: "Not shot yet", url: null, w: null, h: null, place: "Town" },
];

const view = defineView(photos, { columns: { default: ["title", "place"] }, gallery: { image: "url", width: "w", height: "h" } });
const plain = defineView(photos, { columns: { default: ["title", "place"] } });

function provider(): DataProvider {
  return {
    getList: vi.fn(async () => ({ data: ROWS, total: ROWS.length })),
    getOne: vi.fn(async (_r, { id }) => ({ data: ROWS.find((r) => r.id === id) })),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
  } as unknown as DataProvider;
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

/** The gallery lays out from its measured width: the shim turns a `layout` DOM event into onLayout. */
async function measured() {
  const grid = await screen.findByTestId("native-resource-view-gallery");
  act(() => {
    grid.dispatchEvent(new CustomEvent("layout", { detail: { width: 400, height: 0 } }));
  });
}
const tile = (id: string) => screen.queryByTestId(`native-resource-view-gallery-item-${id}`);

describe("NativeResourceView gallery", () => {
  it("draws a photo per row with an image, in place of cards", async () => {
    render(<NativeResourceView view={view} mode="grid" onRowPress={() => undefined} />, { wrapper: wrap(provider()) });
    await measured();
    await waitFor(() => expect(tile("p1")).not.toBeNull());
    expect(tile("p2")).not.toBeNull();
    expect(tile("p3")).toBeNull();
    expect(screen.queryByTestId("native-resource-view-list")).toBeNull();
  });

  it("opens the row on a press: onRowPress, else the peek", async () => {
    const onRowPress = vi.fn();
    const { unmount } = render(<NativeResourceView view={view} mode="grid" onRowPress={onRowPress} />, { wrapper: wrap(provider()) });
    await measured();
    await waitFor(() => expect(tile("p2")).not.toBeNull());
    fireEvent.click(tile("p2")!);
    expect(onRowPress).toHaveBeenCalledWith(ROWS[1]);
    unmount();
    render(<NativeResourceView view={view} mode="grid" />, { wrapper: wrap(provider()) });
    await measured();
    await waitFor(() => expect(tile("p2")).not.toBeNull());
    fireEvent.click(tile("p2")!);
    expect(await screen.findByText("Hills")).toBeTruthy();
  });

  it("keeps list mode, and a view without a gallery, as they were", async () => {
    const { unmount } = render(<NativeResourceView view={view} />, { wrapper: wrap(provider()) });
    expect(await screen.findByText("Not shot yet")).toBeTruthy();
    expect(screen.queryByTestId("native-resource-view-gallery")).toBeNull();
    unmount();
    render(<NativeResourceView view={plain} mode="grid" />, { wrapper: wrap(provider()) });
    expect(await screen.findByText("Not shot yet")).toBeTruthy();
    expect(screen.queryByTestId("native-resource-view-gallery")).toBeNull();
  });

  it("takes a screen's gallery, on a view without one", async () => {
    render(<NativeResourceView view={plain} mode="grid" gallery={{ image: "url" }} />, { wrapper: wrap(provider()) });
    await measured();
    await waitFor(() => expect(tile("p1")).not.toBeNull());
    expect(tile("p3")).toBeNull();
  });
});
