import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState, Button } from "@marktiderman/genesis-ui";
import { Inbox, Search, AlertTriangle } from "lucide-react";

const meta: Meta<typeof EmptyState> = {
  title: "UI/EmptyState",
  component: EmptyState,
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const FirstRun: Story = {
  render: () => (
    <EmptyState
      icon={Inbox}
      title="No items yet"
      description="Get started by creating your first item."
      action={<Button>Create item</Button>}
    />
  ),
};

export const NoResults: Story = {
  render: () => (
    <EmptyState
      icon={Search}
      title="No results"
      description="Try adjusting your search or clearing the filters."
      action={<Button variant="outline">Clear filters</Button>}
    />
  ),
};

export const Error: Story = {
  render: () => (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description="The server returned an error. Try again, or contact support if the problem persists."
      action={<Button>Try again</Button>}
    />
  ),
};

/**
 * `hasFilters` + `onClearFilters` render a "no results match your current
 * filters" state — superseding `title`/`description`/`action` — with a
 * "Clear all filters" action. This is the capability the deprecated
 * `@marktiderman/genesis-ui/data` EmptyState offered, now on the canonical
 * root component. Click "Clear all filters" to see it fall back to the
 * normal empty state.
 */
export const WithActiveFilters: Story = {
  render: function Render() {
    const [hasFilters, setHasFilters] = useState(true);
    return (
      <EmptyState
        icon={Search}
        title="No items yet"
        description="Create your first item to get started."
        hasFilters={hasFilters}
        onClearFilters={() => setHasFilters(false)}
      />
    );
  },
};

// Alias so `/showcase/primitives/empty-state` has a `ui-emptystate--default` story.
export const Default = FirstRun;
