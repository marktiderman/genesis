import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox, Label } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Checkbox> = {
  title: "UI/Checkbox",
  component: Checkbox,
};
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="newsletter" defaultChecked />
      <Label htmlFor="newsletter">Subscribe to the newsletter</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox id="d1" disabled />
        <Label htmlFor="d1">Disabled, unchecked</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox id="d2" disabled defaultChecked />
        <Label htmlFor="d2">Disabled, checked</Label>
      </div>
    </div>
  ),
};
