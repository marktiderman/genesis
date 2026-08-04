import type { Meta, StoryObj } from "@storybook/react";
import { Spinner } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Spinner> = {
  title: "UI/Spinner",
  component: Spinner,
};
export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = { render: () => <Spinner /> };

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <Spinner className="h-4 w-4" />
      <Spinner className="h-6 w-6" />
      <Spinner className="h-8 w-8" />
      <Spinner className="h-10 w-10" />
    </div>
  ),
};
