import type { Meta, StoryObj } from "@storybook/react";
import { Textarea, Label } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Textarea> = { title: "UI/Textarea", component: Textarea };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  render: () => (
    <div style={{ width: 360, display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="msg">Message</Label>
      <Textarea id="msg" placeholder="Type your message…" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Textarea placeholder="Read-only" disabled style={{ width: 360 }} />
  ),
};
