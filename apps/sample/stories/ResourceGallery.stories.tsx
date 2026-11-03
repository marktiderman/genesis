import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Photo = { id: string; title: string; url: string | null; width: number | null; height: number | null; album: string };

const photos = defineResource<Photo>()({
  name: "photos",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "url", type: "string", nullable: true },
    { name: "width", type: "number", nullable: true },
    { name: "height", type: "number", nullable: true },
    { name: "album", type: "string", enumValues: ["Coast", "Hills", "Town"] },
  ],
});

const photosView = defineView(photos, {
  columns: { default: ["title", "album"] },
  gallery: { image: "url", width: "width", height: "height", caption: "album", rowHeight: 180 },
});

const SIZES: [number, number][] = [
  [800, 600],
  [600, 800],
  [800, 800],
  [1200, 600],
  [800, 600],
  [600, 900],
];
const ALBUMS = ["Coast", "Hills", "Town"] as const;
const seed = (): Photo[] =>
  Array.from({ length: 14 }, (_, i) => {
    const [width, height] = SIZES[i % SIZES.length]!;
    return { id: `p${i + 1}`, title: `Photo ${i + 1}`, url: `https://picsum.photos/seed/${i + 1}/${width}/${height}`, width, height, album: ALBUMS[i % 3]! };
  });

function WithPhotos({ children }: { children: ReactNode }) {
  const [provider] = useState(() => createMockProvider({ photos: seed() }));
  return <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

const meta: Meta<typeof ResourceView> = {
  title: "Foundation/Data/ResourceGallery",
  component: ResourceView,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ResourceView>;

/**
 * `<ResourceView mode="grid">` over a view's `gallery` block: a photo per row in justified rows, in
 * place of cards. Click a photo to open its peek; switch to the table and back with the view toggle.
 */
export const FromAView: Story = {
  render: () => (
    <WithPhotos>
      <ResourceView view={photosView} mode="grid" />
    </WithPhotos>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByTestId("resource-gallery")).toBeInTheDocument());
    await waitFor(() => expect(canvas.getByRole("button", { name: "Photo 1" })).toBeInTheDocument());
  },
};

/** A screen's `gallery` on a view without one: the same rows, taller. */
export const ScreenGallery: Story = {
  render: () => (
    <WithPhotos>
      <ResourceView view={defineView(photos, { columns: { default: ["title", "album"] } })} mode="grid" gallery={{ image: "url", width: "width", height: "height", rowHeight: 240 }} />
    </WithPhotos>
  ),
};
