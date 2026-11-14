import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NumberInput } from "@marktiderman/genesis-ui";

const meta: Meta<typeof NumberInput> = { title: "Foundation/UI/NumberInput", component: NumberInput };
export default meta;
type Story = StoryObj<typeof NumberInput>;

export const Quantity: Story = {
  render: () => {
    const [qty, setQty] = useState(1);
    return <NumberInput aria-label="Quantity" value={qty} onChange={setQty} min={1} max={10} />;
  },
};

export const Decimals: Story = {
  render: () => {
    const [kg, setKg] = useState(2.5);
    return <NumberInput aria-label="Weight in kg" value={kg} onChange={setKg} step={0.5} precision={1} min={0} />;
  },
};
