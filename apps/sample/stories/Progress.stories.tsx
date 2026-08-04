import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Progress> = {
  title: "UI/Progress",
  component: Progress,
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
};
export default meta;
type Story = StoryObj<typeof Progress>;

export const Empty: Story = { args: { value: 0 } };
export const Quarter: Story = { args: { value: 25 } };
export const Half: Story = { args: { value: 50 } };
export const ThreeQuarters: Story = { args: { value: 75 } };
export const Full: Story = { args: { value: 100 } };

export const Stack: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}>
      <Progress value={20} />
      <Progress value={40} />
      <Progress value={60} />
      <Progress value={80} />
    </div>
  ),
};
