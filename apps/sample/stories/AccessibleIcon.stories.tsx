import type { Meta, StoryObj } from "@storybook/react";
import { AccessibleIcon, Button } from "@marktiderman/genesis-ui";
import { Trash2 } from "lucide-react";

const meta: Meta<typeof AccessibleIcon> = {
  title: "UI/AccessibleIcon",
  component: AccessibleIcon,
};
export default meta;
type Story = StoryObj<typeof AccessibleIcon>;

/**
 * The glyph is `aria-hidden` and a real accessible name is attached instead —
 * this button is announced as "Delete item, button", not "button".
 */
export const Default: Story = {
  render: () => (
    <Button variant="outline" size="icon">
      <AccessibleIcon label="Delete item">
        <Trash2 />
      </AccessibleIcon>
    </Button>
  ),
};
