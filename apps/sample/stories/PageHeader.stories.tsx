import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";
import { Compass } from "lucide-react";

const meta: Meta<typeof PageHeader> = {
  title: "Layout/PageHeader",
  component: PageHeader,
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const TitleOnly: Story = {
  render: () => <PageHeader title="Overview" subtitle="A calm, single-row header." />,
};

export const WithCountAndCreate: Story = {
  render: () => (
    <PageHeader
      title="Genesis map"
      subtitle="Every subsystem, one table."
      icon={Compass}
      count={12}
      totalCount={12}
      entityName="node"
      createAction={<Button size="sm">New node</Button>}
    />
  ),
};

export const CollapsibleDetails: Story = {
  render: () => (
    <PageHeader
      title="Tasks"
      icon={Compass}
      count={3}
      totalCount={40}
      entityName="task"
      countActive
      details={<div className="text-sm text-muted-foreground">Filter controls live here.</div>}
      detailsHint="3 of 40 shown"
      pageSize={25}
      onPageSizeChange={() => {}}
      density="comfortable"
      onDensityChange={() => {}}
      options={{ configurable: true }}
    />
  ),
};
