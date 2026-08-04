import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup, RadioGroupItem, Label } from "@marktiderman/genesis-ui";

const meta: Meta<typeof RadioGroup> = {
  title: "UI/RadioGroup",
  component: RadioGroup,
};
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="comfortable">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="default" id="r1" />
        <Label htmlFor="r1">Default</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="comfortable" id="r2" />
        <Label htmlFor="r2">Comfortable</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="compact" id="r3" />
        <Label htmlFor="r3">Compact</Label>
      </div>
    </RadioGroup>
  ),
};
