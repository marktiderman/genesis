import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Chip } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Chip> = {
  title: "Resource/Chip",
  component: Chip,
  args: { tone: "info", children: "Open" },
  argTypes: {
    tone: { control: { type: "select" }, options: ["success", "warning", "danger", "info", "muted"] },
  },
};
export default meta;
type Story = StoryObj<typeof Chip>;

export const Status: Story = {};

/** Filter chips: each one toggles, as NativeChip does in a NativeChipGroup. */
export const Selectable: Story = {
  render: () => {
    function Filters() {
      const [on, setOn] = useState<Record<string, boolean>>({ open: true });
      return (
        <div style={{ display: "flex", gap: 8 }}>
          {(["open", "overdue", "done"] as const).map((key) => (
            <Chip
              key={key}
              tone="muted"
              selected={Boolean(on[key])}
              onSelectedChange={(next) => setOn((old) => ({ ...old, [key]: next }))}
            >
              {key[0]!.toUpperCase() + key.slice(1)}
            </Chip>
          ))}
        </div>
      );
    }
    return <Filters />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overdue = canvas.getByRole("button", { name: "Overdue" });
    await expect(overdue).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(overdue);
    await expect(overdue).toHaveAttribute("aria-pressed", "true");
  },
};
