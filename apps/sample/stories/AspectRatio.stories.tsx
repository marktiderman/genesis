import type { Meta, StoryObj } from "@storybook/react";
import { AspectRatio } from "@marktiderman/genesis-ui";

const meta: Meta<typeof AspectRatio> = {
  title: "UI/AspectRatio",
  component: AspectRatio,
};
export default meta;
type Story = StoryObj<typeof AspectRatio>;

export const Sixteen9: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg flex items-center justify-center">
        <span className="text-sm text-muted-foreground">16:9</span>
      </AspectRatio>
    </div>
  ),
};

export const Square: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <AspectRatio ratio={1} className="bg-muted rounded-lg flex items-center justify-center">
        <span className="text-sm text-muted-foreground">1:1</span>
      </AspectRatio>
    </div>
  ),
};
