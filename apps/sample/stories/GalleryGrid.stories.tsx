import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Badge, GalleryGrid, type GalleryItem } from "@marktiderman/genesis-ui";

const SIZES: [number, number][] = [
  [800, 600],
  [600, 800],
  [800, 800],
  [1200, 600],
  [800, 600],
  [600, 900],
];

const ITEMS: GalleryItem[] = Array.from({ length: 18 }, (_, i) => {
  const [width, height] = SIZES[i % SIZES.length]!;
  return {
    id: `p${i}`,
    src: `https://picsum.photos/seed/${i + 1}/${width}/${height}`,
    alt: `Photo ${i + 1}`,
    width,
    height,
  };
});

const meta: Meta<typeof GalleryGrid> = {
  title: "Patterns/GalleryGrid",
  component: GalleryGrid,
  args: { items: ITEMS },
  argTypes: { layout: { control: { type: "select" }, options: ["justified", "grid"] } },
};

export default meta;
type Story = StoryObj<typeof GalleryGrid>;

export const Justified: Story = { args: { layout: "justified", rowHeight: 180 } };
export const Grid: Story = { args: { layout: "grid", columns: 4 } };
export const WithBadges: Story = {
  args: { renderBadges: (item) => (item.id === "p0" ? <Badge>Cover</Badge> : null) },
};

export const Selection: Story = {
  render: function SelectionGrid(args) {
    const [selected, setSelected] = useState<string[]>(["p1"]);
    return <GalleryGrid {...args} selected={selected} onSelectionChange={(ids) => setSelected(ids)} />;
  },
};

export const Groups: Story = {
  args: {
    layout: "justified",
    getGroup: (item) => (Number(item.id.slice(1)) < 9 ? "Morning" : "Afternoon"),
  },
};
