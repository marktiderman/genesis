import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Rating } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Rating> = {
  title: "Patterns/Rating",
  component: Rating,
  args: { value: 3, label: "Rating" },
  argTypes: { size: { control: { type: "select" }, options: ["sm", "md", "lg"] } },
};

export default meta;
type Story = StoryObj<typeof Rating>;

export const ReadOnly: Story = { args: { value: 4 } };

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Rating {...args} size="sm" />
      <Rating {...args} size="md" />
      <Rating {...args} size="lg" />
    </div>
  ),
};

export const Interactive: Story = {
  render: function InteractiveRating(args) {
    const [value, setValue] = useState(2);
    return <Rating {...args} value={value} onChange={setValue} />;
  },
};
