import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Skeleton> = { title: "UI/Skeleton", component: Skeleton };
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Line: Story = {
  render: () => <Skeleton className="h-4 w-[250px]" />,
};

export const Block: Story = {
  render: () => <Skeleton className="h-32 w-[300px]" />,
};

export const Card: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Skeleton className="h-12 w-12 rounded-full" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-4 w-[160px]" />
      </div>
    </div>
  ),
};
