import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip, Button } from "@marktiderman/genesis-ui";
import { Info } from "lucide-react";

const meta: Meta<typeof Tooltip> = { title: "UI/Tooltip", component: Tooltip };
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: { content: "More info" },
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="outline">Hover me</Button>
    </Tooltip>
  ),
};

export const Sides: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, padding: 48 }}>
      <Tooltip content="Top" side="top">
        <Button variant="outline">Top</Button>
      </Tooltip>
      <Tooltip content="Bottom" side="bottom">
        <Button variant="outline">Bottom</Button>
      </Tooltip>
      <Tooltip content="Left" side="left">
        <Button variant="outline">Left</Button>
      </Tooltip>
      <Tooltip content="Right" side="right">
        <Button variant="outline">Right</Button>
      </Tooltip>
    </div>
  ),
};

/**
 * `content` accepts any `ReactNode` — icons, formatted text, multiple
 * lines — not just a plain string.
 */
export const RichContent: Story = {
  render: () => (
    <Tooltip
      content={
        <span className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Pro tip:</strong>
            <br />
            works with icons and multi-line text too.
          </span>
        </span>
      }
    >
      <Button variant="outline" testID="tooltip-rich-content-trigger">
        Rich content
      </Button>
    </Tooltip>
  ),
};
