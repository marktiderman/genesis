import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { createMemoryStorageAdapter, defineResource } from "@marktiderman/genesis-core";
import { createLocalSavedViewStore, defineView } from "@marktiderman/genesis-core/resource-view";
import { useViewListState, ViewFilterControls, ViewSegments, ViewTypeSwitcher } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Deal = { id: string; name: string; stage: "lead" | "won" | "lost"; amount: number; closes_on: string };

const deals = defineResource<Deal>()({
  name: "deals",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "stage", type: "string", enumValues: ["lead", "won", "lost"] },
    { name: "amount", type: "number" },
    { name: "closes_on", type: "datetime", dbType: "date" },
  ],
});

const dealsView = defineView(deals, {
  segments: [
    { id: "open", label: "Open", where: { stage: "lead" }, count: true },
    { id: "won", label: "Won", where: { stage: "won" }, count: true },
    { id: "all", label: "All", count: true },
  ],
  filters: [{ field: "amount" }, { field: "closes_on" }, { field: "name" }],
  board: { field: "stage" },
  calendar: { field: "closes_on" },
});

const seed = (): Deal[] => [
  { id: "1", name: "Acme Rentals renewal", stage: "lead", amount: 1200, closes_on: "2026-11-20" },
  { id: "2", name: "Acme Studio seats", stage: "won", amount: 800, closes_on: "2026-11-02" },
  { id: "3", name: "Acme Freight pilot", stage: "lead", amount: 3000, closes_on: "2026-12-01" },
];

function WithDeals({ children }: { children: ReactNode }) {
  const [provider] = useState(() => createMockProvider({ deals: seed() }));
  return <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

/** The list controls on their own: the parts ResourceView composes, for an app's own list layout. */
function Controls() {
  const [store] = useState(() => createLocalSavedViewStore({ storage: createMemoryStorageAdapter() }));
  const state = useViewListState({
    view: dealsView,
    url: undefined,
    store,
    currentKey: "deals",
    defaultSegment: undefined,
    defaultType: "table",
    types: dealsView.types(),
    rememberType: true,
  });
  return (
    <div className="flex flex-col gap-3">
      <ViewSegments view={dealsView} value={state.segment} onChange={state.setSegment} baseFilters={[]} />
      <div className="flex flex-wrap items-center gap-2">
        <ViewFilterControls view={dealsView} state={state} />
        <span className="ml-auto">
          <ViewTypeSwitcher types={dealsView.types()} value={state.type} onChange={state.setType} />
        </span>
      </div>
      <pre data-testid="list-state" className="rounded-md bg-muted p-2 text-xs">
        {JSON.stringify({ segment: state.segment, type: state.type, filters: state.filters }, null, 2)}
      </pre>
    </div>
  );
}

const meta: Meta<typeof ViewSegments> = {
  title: "Foundation/Data/List controls",
  component: ViewSegments,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ViewSegments>;

/**
 * A view's segments with their counts, its range and text filters, and the switcher across its
 * types (table, list, grid, board, calendar), held by `useViewListState`; the provider filters
 * they make are shown below.
 */
export const SegmentsFiltersAndSwitcher: Story = {
  render: () => (
    <WithDeals>
      <Controls />
    </WithDeals>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByTestId("view-segment-open").textContent).toContain("2"));
    await expect(canvas.getByTestId("view-type-board")).toBeInTheDocument();
  },
};
