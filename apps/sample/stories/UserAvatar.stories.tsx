import type { Meta, StoryObj } from "@storybook/react";
import { UserAvatar } from "@marktiderman/genesis-ui";

const meta: Meta<typeof UserAvatar> = {
  title: "UI/UserAvatar",
  component: UserAvatar,
  args: { name: "Ada Lovelace" },
};
export default meta;
type Story = StoryObj<typeof UserAvatar>;

export const InitialsFallback: Story = {
  args: { name: "Ada Lovelace" },
};

export const SingleWordName: Story = {
  args: { name: "Cher" },
};

export const WithImage: Story = {
  args: {
    name: "Grace Hopper",
    src: "https://github.com/shadcn.png",
  },
};

export const BrokenImageFallsBackToInitials: Story = {
  args: {
    name: "Marie Curie",
    src: "https://broken.example/does-not-exist.png",
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <UserAvatar name="Ada Lovelace" size="sm" />
      <UserAvatar name="Ada Lovelace" size="default" />
      <UserAvatar name="Ada Lovelace" size="lg" />
    </div>
  ),
};
