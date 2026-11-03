import type { Meta, StoryObj } from "@storybook/react-vite";
import { LiveIndicator } from "@marktiderman/genesis-ui";

const meta: Meta<typeof LiveIndicator> = {
  title: "Patterns/LiveIndicator",
  component: LiveIndicator,
  argTypes: {
    state: { control: { type: "select" }, options: ["live", "idle", "offline"] },
    variant: { control: { type: "select" }, options: ["pill", "dot"] },
  },
};

export default meta;
type Story = StoryObj<typeof LiveIndicator>;

export const Live: Story = { args: { state: "live" } };
export const Idle: Story = { args: { state: "idle", label: "Idle", detail: "last photo 2m ago" } };
export const Offline: Story = { args: { state: "offline", label: "Offline" } };
export const Dot: Story = { args: { state: "live", variant: "dot" } };
