import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceSheet } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Order = { id: string; customer: string; status: "draft" | "sent" | "paid"; amount: number; locked: boolean; created_at: string };

const orders = defineResource<Order>()({
  name: "orders",
  key: "id",
  labelField: "customer",
  fields: [
    { name: "id", type: "string" },
    { name: "customer", type: "string" },
    { name: "status", type: "string", enumValues: ["draft", "sent", "paid"] },
    { name: "amount", type: "number" },
    { name: "locked", type: "boolean" },
    { name: "created_at", type: "datetime", readOnly: true },
  ],
});

const ordersView = defineView(orders, {
  columns: { default: ["customer", "status", "amount", "created_at"] },
  can: { update: (o) => (o.locked ? "Paid orders are locked." : true) },
});

const seed = (): Order[] => [
  { id: "O-1", customer: "Acme Rentals", status: "draft", amount: 120, locked: false, created_at: "2026-11-10T09:00:00Z" },
  { id: "O-2", customer: "Acme Studio", status: "sent", amount: 340, locked: false, created_at: "2026-11-11T10:30:00Z" },
  { id: "O-3", customer: "Acme Freight", status: "paid", amount: 980, locked: true, created_at: "2026-11-12T14:15:00Z" },
];

function WithOrders({ children }: { children: ReactNode }) {
  const [provider] = useState(() => createMockProvider({ orders: seed() }));
  return <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

const meta: Meta<typeof ResourceSheet> = {
  title: "Foundation/Data/ResourceSheet",
  component: ResourceSheet,
};
export default meta;
type Story = StoryObj<typeof ResourceSheet>;

/**
 * Acme's orders as a spreadsheet: the customer, status and amount edit in place (arrows, Enter,
 * paste), the created date is read-only, and the paid order's cells are locked with the view's
 * reason on them. Every change goes through the resource's update; Undo puts the last one back.
 */
export const Orders: Story = {
  render: () => (
    <WithOrders>
      <ResourceSheet view={ordersView} />
    </WithOrders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Acme Freight");
    await waitFor(() => expect(canvas.getByTestId("resource-sheet")).toBeInTheDocument());
  },
};
