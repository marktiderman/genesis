"use client";
// ResourceView's gallery: `mode="grid"` over a view's `gallery` block draws a photo per row in
// GalleryGrid's justified rows, in place of cards. It stands in for ResourcePage's grid slot, so
// paging, search, the peek and the table and list views stay ResourcePage's; only the grid view
// changes. The rows become photos through `view.galleryItem`, the layout is genesis-core's
// `justifyRows`, the same as GalleryGrid's anywhere else.

import { useMemo, type ComponentProps, type ComponentType } from "react";
import type { DataRow } from "@marktiderman/genesis-core";
import type { GalleryItem } from "@marktiderman/genesis-core/gallery";
import type { ResourceView as View, ViewGallery } from "@marktiderman/genesis-core/resource-view";
import { DataGrid } from "../DataGrid";
import { GalleryGrid } from "../../patterns/gallery-grid";

type Row = Record<string, unknown>;
type GridProps<T> = ComponentProps<typeof DataGrid<T>>;

/**
 * A ResourcePage grid slot that draws the grid view as a gallery: the table and list views pass
 * through to DataGrid untouched. A row without an image is a placeholder tile (an empty `src`), so
 * the gallery draws every row the count says. Clicking a photo opens the row, as clicking a card does.
 */
export function galleryGridSlot<T extends Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<any, T & DataRow>,
  override: Partial<ViewGallery> | undefined,
): ComponentType<GridProps<T>> & { opensItems: true } {
  function ResourceGallery(props: GridProps<T>) {
    const { items, viewMode, onItemClick } = props;
    const photos = useMemo(() => {
      const byId = new Map<string, T>();
      const list: GalleryItem[] = [];
      for (const row of items) {
        const photo = view.galleryItem(row as T & DataRow, override);
        if (!photo) continue;
        byId.set(photo.id, row);
        list.push(photo);
      }
      return { list, byId };
    }, [items]);
    if (viewMode !== "grid") return <DataGrid<T> {...props} />;
    const rowHeight = override?.rowHeight ?? view.definition.gallery?.rowHeight;
    return (
      <div data-slot="gallery" data-testid="resource-gallery">
        <GalleryGrid
          items={photos.list}
          {...(rowHeight !== undefined ? { rowHeight } : {})}
          {...(onItemClick
            ? {
                onItemClick: (photo: GalleryItem) => {
                  const row = photos.byId.get(photo.id);
                  if (row) onItemClick(row);
                },
              }
            : {})}
        />
      </div>
    );
  }
  // ResourcePage hands its open handler (`onItemClick`) only to a grid slot that asks for it.
  return Object.assign(ResourceGallery, { opensItems: true as const });
}
