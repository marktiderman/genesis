import type { Meta, StoryObj } from "@storybook/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Button,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof Collapsible> = {
  title: "UI/Collapsible",
  component: Collapsible,
};
export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  render: () => (
    <Collapsible style={{ width: 360 }}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost">Toggle details</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <div className="rounded-md border px-4 py-2 text-sm">First detail row.</div>
        <div className="rounded-md border px-4 py-2 text-sm">Second detail row.</div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
