import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RangeSlider } from "@marktiderman/genesis-ui";

const meta: Meta<typeof RangeSlider> = { title: "Foundation/UI/RangeSlider", component: RangeSlider };
export default meta;
type Story = StoryObj<typeof RangeSlider>;

export const PriceBand: Story = {
  render: () => {
    const [range, setRange] = useState<[number, number]>([20, 80]);
    return (
      <div className="flex w-80 flex-col gap-3">
        <RangeSlider value={range} onChange={setRange} step={5} labels={["Lowest price", "Highest price"]} />
        <p className="text-sm text-muted-foreground">
          ${range[0]} to ${range[1]}
        </p>
      </div>
    );
  },
};
