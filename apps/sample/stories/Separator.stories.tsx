import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Separator> = { title: "UI/Separator", component: Separator };
export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <p>Above</p>
      <Separator className="my-3" />
      <p>Below</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", height: 40, gap: 12 }}>
      <span>Item one</span>
      <Separator orientation="vertical" />
      <span>Item two</span>
      <Separator orientation="vertical" />
      <span>Item three</span>
    </div>
  ),
};
