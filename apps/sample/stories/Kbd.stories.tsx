import type { Meta, StoryObj } from "@storybook/react";
import { Kbd } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Kbd> = { title: "UI/Kbd", component: Kbd };
export default meta;
type Story = StoryObj<typeof Kbd>;

export const Default: Story = {
  render: () => (
    <p>
      Press <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open the command palette.
    </p>
  ),
};

export const Multiple: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Kbd>Esc</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </div>
  ),
};
