import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChipGroup, ChipGroupItem } from "@marktiderman/genesis-ui";

const meta: Meta<typeof ChipGroup> = { title: "Foundation/UI/ChipGroup", component: ChipGroup };
export default meta;
type Story = StoryObj<typeof ChipGroup>;

export const Single: Story = {
  render: () => {
    const [level, setLevel] = useState<string | string[]>("all");
    return (
      <ChipGroup value={level} onChange={setLevel} aria-label="Level">
        <ChipGroupItem value="all">All</ChipGroupItem>
        <ChipGroupItem value="beginner">Beginner</ChipGroupItem>
        <ChipGroupItem value="advanced">Advanced</ChipGroupItem>
      </ChipGroup>
    );
  },
};

export const Multiple: Story = {
  render: () => {
    const [days, setDays] = useState<string | string[]>(["mon"]);
    return (
      <ChipGroup mode="multiple" value={days} onChange={setDays} aria-label="Days">
        {["mon", "tue", "wed", "thu", "fri"].map((d) => (
          <ChipGroupItem key={d} value={d}>
            {d}
          </ChipGroupItem>
        ))}
      </ChipGroup>
    );
  },
};
