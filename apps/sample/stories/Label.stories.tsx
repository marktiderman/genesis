import type { Meta, StoryObj } from "@storybook/react";
import { Label, Input, Checkbox } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Label> = {
  title: "UI/Label",
  component: Label,
};
export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  render: () => (
    <div className="space-y-1.5">
      <Label htmlFor="label-story-name">Name</Label>
      <Input id="label-story-name" placeholder="Jane Doe" />
    </div>
  ),
};

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="label-story-terms" />
      <Label htmlFor="label-story-terms">Accept terms and conditions</Label>
    </div>
  ),
};
