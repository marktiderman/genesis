import type { Meta, StoryObj } from "@storybook/react";
import { Switch, Label } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Switch> = {
  title: "UI/Switch",
  component: Switch,
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Switch id="airplane" />
      <Label htmlFor="airplane">Airplane mode</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Switch id="dnd" defaultChecked />
      <Label htmlFor="dnd">Do not disturb</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Switch id="locked" disabled />
      <Label htmlFor="locked">Disabled</Label>
    </div>
  ),
};
