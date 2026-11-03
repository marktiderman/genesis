import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button, Lightbox, type GalleryItem } from "@marktiderman/genesis-ui";

const ITEMS: GalleryItem[] = Array.from({ length: 6 }, (_, i) => ({
  id: `l${i}`,
  src: `https://picsum.photos/seed/${i + 20}/1200/800`,
  alt: `Photo ${i + 1}`,
  width: 1200,
  height: 800,
  caption: `Photo ${i + 1} of 6`,
}));

const meta: Meta<typeof Lightbox> = {
  title: "Patterns/Lightbox",
  component: Lightbox,
  args: { items: ITEMS, title: "Gallery", description: "Use the arrow keys" },
};

export default meta;
type Story = StoryObj<typeof Lightbox>;

export const Default: Story = {
  render: function LightboxDemo(args) {
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open lightbox</Button>
        <Lightbox {...args} open={open} onOpenChange={setOpen} index={index} onIndexChange={setIndex} />
      </>
    );
  },
};
