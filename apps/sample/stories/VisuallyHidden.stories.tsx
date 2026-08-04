import type { Meta, StoryObj } from "@storybook/react";
import { VisuallyHidden, Button } from "@marktiderman/genesis-ui";
import { X } from "lucide-react";

const meta: Meta<typeof VisuallyHidden> = {
  title: "UI/VisuallyHidden",
  component: VisuallyHidden,
};
export default meta;
type Story = StoryObj<typeof VisuallyHidden>;

/**
 * The text is really there — inspect the DOM, or turn on a screen reader.
 * It just isn't drawn on screen, which is the whole point: an icon-only
 * button still needs a real accessible name.
 */
export const Default: Story = {
  render: () => (
    <Button variant="outline" size="icon" aria-label="Close">
      <X className="h-4 w-4" />
      <VisuallyHidden>Close</VisuallyHidden>
    </Button>
  ),
};
