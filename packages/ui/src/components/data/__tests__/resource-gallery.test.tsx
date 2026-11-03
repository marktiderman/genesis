// @feat:media-gallery @feat:resource-view-gallery
/**
 * ResourceView `mode="grid"` over a view's `gallery` block: a photo per row in GalleryGrid's
 * justified rows, in place of cards.
 * - rows become photos through `view.galleryItem` (a row without an image is a placeholder);
 * - clicking a photo opens the row's peek, as clicking a card does;
 * - the table view is untouched, and a screen's own grid slot still wins;
 * - a screen's `gallery` overrides the view's block, or adds one.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView } from "../resource-view";

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

const view = defineView(photos, { columns: { default: ["title", "place"] }, gallery: { image: "url", width: "w", height: "h", caption: "place", rowHeight: 200 } });

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

const tiles = () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="gallery-tile"]'));

describe("ResourceView gallery", () => {
  it("draws a photo per row, in justified rows, in place of cards; a row without an image is still a tile", async () => {
    localStorage.clear();
    render(<ResourceView view={view} mode="grid" />, { wrapper: wrap(provider()) });
    await waitFor(() => expect(tiles()).toHaveLength(3));
    expect(screen.getByTestId("resource-gallery").querySelector('[data-layout="justified"]')).not.toBeNull();
    expect(tiles().map((t) => t.getAttribute("aria-label"))).toEqual(["Harbour", "Ridge", "Not shot yet"]);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://example.test/p1.jpg");
    expect(screen.queryByTestId("resource-card")).toBeNull();
  });

  it("opens the row's peek when a photo is clicked", async () => {
    localStorage.clear();
    render(<ResourceView view={view} mode="grid" />, { wrapper: wrap(provider()) });
    await waitFor(() => expect(tiles()).toHaveLength(3));
    fireEvent.click(tiles()[1]!);
    expect(await screen.findByText("Hills")).toBeTruthy();
  });

  it("leaves the table view alone", async () => {
    localStorage.clear();
    render(<ResourceView view={view} mode="table" />, { wrapper: wrap(provider()) });
    expect(await screen.findByText("Not shot yet")).toBeTruthy();
    expect(screen.queryByTestId("resource-gallery")).toBeNull();
  });

  it("lets a screen's own grid slot win", async () => {
    localStorage.clear();
    const Mine = () => <div data-testid="my-grid" />;
    render(<ResourceView view={view} mode="grid" slots={{ grid: Mine }} />, { wrapper: wrap(provider()) });
    expect(await screen.findByTestId("my-grid")).toBeTruthy();
    expect(screen.queryByTestId("resource-gallery")).toBeNull();
  });

  it("takes a screen's gallery over the view's, and adds one to a view without", async () => {
    localStorage.clear();
    const plain = defineView(photos, { columns: { default: ["title"] } });
    render(<ResourceView view={plain} mode="grid" gallery={{ image: "url", alt: "place" }} />, { wrapper: wrap(provider()) });
    await waitFor(() => expect(tiles()).toHaveLength(3));
    expect(tiles().map((t) => t.getAttribute("aria-label"))).toEqual(["Bay", "Hills", "Town"]);
  });
});
