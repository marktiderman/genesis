import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "@marktiderman/genesis-ui";

const VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "success",
  "warning",
  "info",
  "muted",
] as const;

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  args: { children: "Badge" },
  argTypes: {
    variant: {
      control: { type: "select" },
      options: VARIANTS,
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = { args: { variant: "default" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Destructive: Story = { args: { variant: "destructive" } };
export const Success: Story = { args: { variant: "success" } };
export const Warning: Story = { args: { variant: "warning" } };
export const Info: Story = { args: { variant: "info" } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {VARIANTS.map((v) => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </div>
  ),
};
