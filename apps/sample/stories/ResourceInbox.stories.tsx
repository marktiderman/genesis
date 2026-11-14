import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceInbox } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Ticket = { id: string; subject: string; body: string; requester: string; status: "open" | "waiting" | "solved"; unread: boolean; updated_at: string };

const tickets = defineResource<Ticket>()({
  name: "tickets",
  key: "id",
  labelField: "subject",
  fields: [
    { name: "id", type: "string" },
    { name: "subject", type: "string" },
    { name: "body", type: "string", control: "textarea" },
    { name: "requester", type: "string" },
    { name: "status", type: "string", enumValues: ["open", "waiting", "solved"] },
    { name: "unread", type: "boolean" },
    { name: "updated_at", type: "datetime" },
  ],
});

const ticketsView = defineView(tickets, {
  fields: { status: { tones: { open: "info", waiting: "warning", solved: "success" } } },
  segments: [
    { id: "open", label: "Open", where: { status: "open" }, count: true },
    { id: "waiting", label: "Waiting", where: { status: "waiting" }, count: true },
    { id: "solved", label: "Solved", where: { status: "solved" }, count: true },
  ],
  actions: [{ name: "done", label: "Solve", bulk: true }],
  inbox: { preview: "body", time: "updated_at", from: "requester", unread: "unread", badge: "status" },
});

const seed = (): Ticket[] => [
  { id: "T-1", subject: "Can't sign in on my phone", body: "The code never arrives.", requester: "Ada at Acme Rentals", status: "open", unread: true, updated_at: "2026-11-13T09:12:00Z" },
  { id: "T-2", subject: "Invoice copy for October", body: "Please resend it to our new address.", requester: "Bo at Acme Studio", status: "open", unread: false, updated_at: "2026-11-13T08:40:00Z" },
  { id: "T-3", subject: "Export is greyed out", body: "On the Orders list the option is disabled.", requester: "Cy at Acme Freight", status: "waiting", unread: false, updated_at: "2026-11-12T16:05:00Z" },
  { id: "T-4", subject: "Thanks for the fix", body: "All working again.", requester: "Di at Acme Rentals", status: "solved", unread: false, updated_at: "2026-11-11T11:30:00Z" },
];

function WithTickets({ children }: { children: ReactNode }) {
  // The in-memory provider runs no actions of its own: Solve (the view's `done`, also the e key)
  // sets the ticket's status here, as an app's provider or `onAction` would.
  const [provider] = useState(() => {
    const base = createMockProvider({ tickets: seed() });
    return {
      ...base,
      runAction: async (resource: string, { id, action }: { id: string | number; action: string }) => {
        if (action === "done") await base.update(resource, { id, data: { status: "solved" } });
        return { data: null };
      },
    };
  });
  return <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

const meta: Meta<typeof ResourceInbox> = {
  title: "Foundation/Data/ResourceInbox",
  component: ResourceInbox,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ResourceInbox>;

/**
 * A support-ticket inbox at Acme: the segments with their counts in the rail, the tickets with
 * unread ones in bold, and the open ticket's page beside them. j and k move; e solves.
 */
export const SupportTickets: Story = {
  render: () => (
    <WithTickets>
      <ResourceInbox view={ticketsView} className="h-[36rem]" />
    </WithTickets>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Can't sign in on my phone"));
    await waitFor(() => expect(canvas.getByTestId("resource-inbox-reading")).toBeInTheDocument());
  },
};
