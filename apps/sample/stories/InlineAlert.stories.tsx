import type { Meta, StoryObj } from "@storybook/react-vite";
import { Banner, Button, InlineAlert } from "@marktiderman/genesis-ui";

const meta: Meta<typeof InlineAlert> = { title: "Foundation/UI/InlineAlert", component: InlineAlert };
export default meta;
type Story = StoryObj<typeof InlineAlert>;

export const Variants: Story = {
  render: () => (
    <div className="flex w-[28rem] flex-col gap-3">
      <InlineAlert variant="info" title="Heads up" description="Classes on public holidays are optional." />
      <InlineAlert variant="success" title="Saved" description="Your changes are live." />
      <InlineAlert variant="warning" title="Almost full" description="Two places left in this class." />
      <InlineAlert
        variant="destructive"
        title="Fix 2 fields"
        description="Name and email need a value."
        actions={<Button size="sm" variant="outline">Review</Button>}
        onDismiss={() => {}}
      />
    </div>
  ),
};

export const BannerAcrossThePage: Story = {
  render: () => (
    <div className="w-[36rem] border border-border">
      <Banner variant="warning" title="You're offline" description="Changes save when you're back." onDismiss={() => {}} />
      <p className="p-4 text-sm text-muted-foreground">Page content…</p>
    </div>
  ),
};
