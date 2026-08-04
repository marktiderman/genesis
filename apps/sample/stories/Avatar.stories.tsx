import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, AvatarFallback, AvatarImage } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Avatar> = {
  title: "UI/Avatar",
  component: Avatar,
};
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Image: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
};

export const InitialsFallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>GN</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar className="h-6 w-6">
        <AvatarFallback>S</AvatarFallback>
      </Avatar>
      <Avatar className="h-10 w-10">
        <AvatarFallback>M</AvatarFallback>
      </Avatar>
      <Avatar className="h-14 w-14">
        <AvatarFallback>L</AvatarFallback>
      </Avatar>
      <Avatar className="h-20 w-20">
        <AvatarFallback>XL</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const Stack: Story = {
  render: () => (
    <div style={{ display: "flex" }}>
      <Avatar className="ring-2 ring-background">
        <AvatarFallback>A</AvatarFallback>
      </Avatar>
      <Avatar className="ring-2 ring-background -ml-2">
        <AvatarFallback>B</AvatarFallback>
      </Avatar>
      <Avatar className="ring-2 ring-background -ml-2">
        <AvatarFallback>C</AvatarFallback>
      </Avatar>
      <Avatar className="ring-2 ring-background -ml-2">
        <AvatarFallback>+3</AvatarFallback>
      </Avatar>
    </div>
  ),
};
