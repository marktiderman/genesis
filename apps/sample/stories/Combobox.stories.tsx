import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Combobox } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Combobox> = { title: "Foundation/UI/Combobox", component: Combobox };
export default meta;
type Story = StoryObj<typeof Combobox>;

const cities = [
  { value: "zurich", label: "Zürich", description: "Switzerland" },
  { value: "sao-paulo", label: "São Paulo", description: "Brazil" },
  { value: "paris", label: "Paris", description: "France" },
  { value: "oslo", label: "Oslo", description: "Norway" },
];

export const Default: Story = {
  render: () => {
    const [city, setCity] = useState<string | undefined>();
    return (
      <div className="w-72">
        <Combobox aria-label="City" options={cities} value={city} onChange={setCity} placeholder="Choose a city" searchPlaceholder="Find a city" />
      </div>
    );
  },
};
