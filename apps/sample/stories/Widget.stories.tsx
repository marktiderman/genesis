import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView, defineWidget } from "@marktiderman/genesis-core/resource-view";
import { Widget, WidgetGrid, WidgetTile } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Deal = { id: string; title: string; stage: "open" | "won"; amount: number | null };

const deals = defineResource<Deal>()({
  name: "deals",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["open", "won"] },
    { name: "amount", type: "number", nullable: true },
  ],
});

const view = defineView(deals, { presets: { open: { filter: { stage: "open" } }, won: { filter: { stage: "won" } } } });

const seed = (): Deal[] => [
  { id: "1", title: "Harbor", stage: "open", amount: 100 },
  { id: "2", title: "Lantern", stage: "open", amount: 250 },
  { id: "3", title: "Quarry", stage: "won", amount: 400 },
];

const open = defineWidget({ id: "open", kind: "number", label: "Open deals", view, preset: "open", live: false });
const pipeline = defineWidget({ id: "pipeline", kind: "number", label: "Pipeline", view, preset: "open", metric: { fn: "sum", field: "amount" }, format: { currency: "USD", maximumFractionDigits: 0 }, live: false });
const won = defineWidget({ id: "won", kind: "progress", label: "Won", view, preset: "won", goal: { fn: "count" }, live: false });
const recent = defineWidget({ id: "recent", kind: "list", label: "Open deals", view, preset: "open", limit: 5, live: false });

/** A fresh in-memory provider per render. */
function WithDeals({ children }: { children: ReactNode }) {
  const [provider] = useState(() => createMockProvider({ deals: seed() }));
  return <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

const meta: Meta<typeof Widget> = {
  title: "Foundation/Data/Widget",
  component: Widget,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Widget>;

/** `<Widget>`: a tile fed by a view, with its own loading, error and empty states. */
export const Kinds: Story = {
  render: () => (
    <WithDeals>
      <WidgetGrid columns={4}>
        <Widget widget={open} />
        <Widget widget={pipeline} locale="en-US" />
        <Widget widget={won} locale="en-US" />
        <Widget widget={recent} />
      </WidgetGrid>
    </WithDeals>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByTestId("widget-pipeline").textContent).toContain("$350"));
  },
};

/** `WidgetTile`: the one tile under every widget, StatCard, HeadlineNumbers and SummaryCard. */
export const Tile: Story = {
  render: () => <WidgetTile label="Checked in" value="18 / 20" detail="6:00 am class" />,
};
