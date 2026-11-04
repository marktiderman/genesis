import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentTicket, SupportClient, SupportReply } from "@marktiderman/genesis-support";
import { SupportAgentInbox } from "@marktiderman/genesis-support/web-chat";

const meta: Meta = {
  title: "Modules/Support/SupportAgentInbox",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const ME = "agent-sam";
const NAMES: Record<string, string> = { "client-ada": "Ada Lovelace", "client-grace": "Grace Hopper", "client-alan": "Alan Turing", [ME]: "Sam Rivera", "agent-kit": "Kit Chen" };
const at = (minAgo: number) => new Date(Date.UTC(2026, 10, 3, 12, 0) - minAgo * 60_000).toISOString();

const seed = (over: Partial<AgentTicket> & Pick<AgentTicket, "id" | "title" | "message" | "userId" | "preview">): AgentTicket => ({
  tenantId: "acme",
  type: "bug",
  status: "open",
  featureId: null,
  route: "/reports",
  appVersion: "2.4.0",
  createdAt: at(300),
  updatedAt: at(4),
  lastStaffReplyAt: null,
  lastUserReplyAt: at(4),
  userReadAt: null,
  staffReadAt: null,
  unread: false,
  severity: null,
  channel: null,
  conversationId: `conv-${over.id}`,
  assigneeId: null,
  activityAt: at(4),
  ...over,
});

const TICKETS: AgentTicket[] = [
  seed({ id: "t1", title: "The export button does nothing", message: "On the Reports page it never downloads.", userId: "client-ada", preview: "It also happens on the Invoices page.", unread: true, assigneeId: ME, severity: "high" }),
  seed({ id: "t2", title: "How do I add a second admin?", message: "We have a new office manager.", userId: "client-grace", preview: "We have a new office manager.", type: "question", unread: true, activityAt: at(90), route: null }),
  seed({ id: "t3", title: "Love the new schedule view", message: "Much faster.", userId: "client-alan", preview: "Thanks, passing it on.", type: "praise", status: "addressed", assigneeId: "agent-kit", activityAt: at(1500) }),
];

const REPLIES: SupportReply[] = [
  { id: "m1", reportId: "t1", body: "On the Reports page it never downloads.", fromStaff: false, mine: false, authorId: "client-ada", createdAt: at(42) },
  { id: "m2", reportId: "t1", body: "Thanks Ada, looking now. Which browser?", fromStaff: true, mine: true, authorId: ME, createdAt: at(40) },
  { id: "m3", reportId: "t1", body: "Safari on a Mac.", fromStaff: false, mine: false, authorId: "client-ada", createdAt: at(35) },
  { id: "m4", reportId: "t1", body: "Reproduced on Safari only.", fromStaff: true, mine: true, internal: true, authorId: ME, createdAt: at(30) },
  { id: "m5", reportId: "t1", body: "It also happens on the Invoices page.", fromStaff: false, mine: false, authorId: "client-ada", createdAt: at(4) },
];

function sampleClient(): SupportClient {
  const tickets = new Map(TICKETS.map((t) => [t.id, t]));
  const replies = new Map<string, SupportReply[]>([["t1", [...REPLIES]]]);
  const inView = (t: AgentTicket, view: string) => {
    const open = t.status !== "addressed" && t.status !== "wont_fix";
    return view === "mine" ? open && t.assigneeId === ME : view === "unassigned" ? open && !t.assigneeId : true;
  };
  const client: Partial<SupportClient> = {
    agentTickets: async ({ view = "all" } = {}) => [...tickets.values()].filter((t) => inView(t, view)),
    agentTicket: async (id) => tickets.get(id) ?? null,
    agentTicketCounts: async () => {
      const all = [...tickets.values()];
      return { mine: all.filter((t) => inView(t, "mine")).length, unassigned: all.filter((t) => inView(t, "unassigned")).length, all: all.length };
    },
    thread: async (id) => ({ mode: "chat", conversationId: `conv-${id}` }),
    replies: async (id) => replies.get(id) ?? [],
    reply: async (id, body, options) => {
      const sent: SupportReply = { id: `m${Date.now()}`, reportId: id, body, fromStaff: true, mine: true, internal: options?.internal ?? false, authorId: ME, createdAt: new Date().toISOString() };
      replies.set(id, [...(replies.get(id) ?? []), sent]);
      return sent;
    },
    markRead: async (id) => {
      const t = tickets.get(id);
      if (t) tickets.set(id, { ...t, unread: false });
    },
    subscribe: () => () => undefined,
    attachments: async () => [],
    setStatus: async (id, status) => {
      const t = tickets.get(id);
      if (t) tickets.set(id, { ...t, status });
    },
    assign: async (id, assigneeId) => {
      const t = tickets.get(id);
      if (t) tickets.set(id, { ...t, assigneeId });
    },
  };
  return client as SupportClient;
}

const AGENTS = [
  { id: ME, name: "Sam Rivera" },
  { id: "agent-kit", name: "Kit Chen" },
];

function Inbox({ initial }: { initial: string | null }) {
  const [ticketId, setTicketId] = React.useState(initial);
  const [queryClient] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [client] = React.useState(sampleClient);
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ height: "100vh" }}>
        <SupportAgentInbox
          client={client}
          tenantId="acme"
          ticketId={ticketId}
          onTicketChange={setTicketId}
          resolveUser={(id) => ({ name: NAMES[id] ?? "Someone" })}
          agents={AGENTS}
          refreshInterval={false}
          context={() => (
            <section aria-label="Account" className="rounded-md border p-3 text-sm">
              <p className="font-medium">Acme, Team plan</p>
              <p className="text-muted-foreground">12 seats. A card the app adds.</p>
            </section>
          )}
        />
      </div>
    </QueryClientProvider>
  );
}

/** A ticket open beside the list, with its details. */
export const TicketOpen: Story = { render: () => <Inbox initial="t1" /> };

/** Nothing open yet. */
export const NothingOpen: Story = { render: () => <Inbox initial={null} /> };
