import type { Meta, StoryObj } from "@storybook/react";
import { PageLoading } from "@marktiderman/genesis-ui";

const meta: Meta<typeof PageLoading> = {
  title: "UI/PageLoading",
  component: PageLoading,
};
export default meta;
type Story = StoryObj<typeof PageLoading>;

export const Page: Story = {
  render: () => (
    <div className="w-[32rem] border border-border">
      <PageLoading />
    </div>
  ),
};

export const PageWithLabel: Story = {
  render: () => (
    <div className="w-[32rem] border border-border">
      <PageLoading label="Loading dashboard…" />
    </div>
  ),
};

export const Section: Story = {
  render: () => (
    <div className="w-96 border border-border">
      <PageLoading variant="section" label="Loading results…" />
    </div>
  ),
};
