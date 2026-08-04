import type { Meta, StoryObj } from "@storybook/react";
import { Input, Label } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  args: { placeholder: "Type here…" },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Plain: Story = {};

export const WithLabel: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 8, width: 320 }}>
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: "Cannot edit" },
};

export const Password: Story = {
  args: { type: "password", placeholder: "Enter password" },
};
