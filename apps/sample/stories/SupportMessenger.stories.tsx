import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HelpArticle, SupportClient, SupportReply, Ticket } from "@marktiderman/genesis-support";
import { SupportHelpCenterAdmin, SupportMessenger, SupportMessengerLauncher, type HelpAiResult } from "@marktiderman/genesis-support/web-chat";

const meta: Meta = {
  title: "Modules/Support/SupportMessenger",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const at = (minAgo: number) => new Date(Date.UTC(2026, 10, 3, 12, 0) - minAgo * 60_000).toISOString();

const ARTICLES: HelpArticle[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    collectionId: "billing",
    slug: "download-an-invoice",
    title: "Download an invoice",
    summary: "Where your invoices are, and how to get a copy.",
    status: "published",
    publishedAt: at(9000),
    updatedAt: at(9000),
    body: "Open Settings, then Billing.\n\nEach invoice has a Download button beside it.",
  },
  {
    id: "a1000000-0000-4000-8000-000000000002",
    collectionId: null,
    slug: "reset-your-password",
    title: "Reset your password",
    summary: "Getting back in.",
    status: "published",
    publishedAt: at(8000),
    updatedAt: at(8000),
    body: "Press Forgot password on the sign-in page.\n\nAn email arrives in a minute or two.",
  },
  {
    id: "a1000000-0000-4000-8000-000000000003",
    collectionId: null,
    slug: "new-pricing",
    title: "New pricing",
    summary: null,
    status: "draft",
    publishedAt: null,
    updatedAt: at(100),
    body: "Not announced yet.",
  },
];

const TICKET: Ticket = {
  id: "t1",
  type: "question",
  title: null,
  message: "Where do I find last month's invoice?",
  status: "open",
  featureId: null,
  route: null,
  appVersion: null,
  createdAt: at(60),
  updatedAt: at(30),
  lastStaffReplyAt: at(30),
  lastUserReplyAt: null,
  userReadAt: null,
  staffReadAt: at(40),
  unread: true,
  userId: "me",
};

function sampleClient(): SupportClient {
  const articles = [...ARTICLES];
  const replies: SupportReply[] = [{ id: "r1", reportId: "t1", body: "It's under Settings, then Billing. Anything else?", fromStaff: true, mine: false, createdAt: at(30) }];
  const client: Partial<SupportClient> = {
    myReports: async () => [TICKET],
    report: async (id) => (id === "t1" ? TICKET : { ...TICKET, id, unread: false }),
    thread: async (id) => ({ mode: "chat", conversationId: `conv-${id}` }),
    replies: async (id) => (id === "t1" ? replies : []),
    reply: async (id, body) => {
      const sent: SupportReply = { id: `m${Date.now()}`, reportId: id, body, fromStaff: false, mine: true, createdAt: new Date().toISOString() };
      replies.push(sent);
      return sent;
    },
    markRead: async () => undefined,
    subscribe: () => () => undefined,
    submit: async () => ({ id: "t2", attachmentsDropped: 0 }),
    helpCollections: async () => [{ id: "billing", title: "Billing", description: "Invoices and plans", position: 0 }],
    helpArticles: async ({ collectionId, includeDrafts } = {}) => articles.filter((a) => (includeDrafts || a.status === "published") && (!collectionId || a.collectionId === collectionId)),
    helpArticle: async (ref) => articles.find((a) => a.slug === ref || a.id === ref) ?? null,
    searchHelp: async (query) => articles.filter((a) => a.status === "published" && (a.title + a.body).toLowerCase().includes(query.toLowerCase().split(" ")[0] ?? "")),
    helpAiEnabled: async () => true,
    askHelp: async () => "q1",
    recordHelpAnswer: async (_id, _answer, ids) => (ids.length ? "answered" : "no_answer"),
    closeHelpQuestion: async () => undefined,
    saveHelpArticle: async (input) => input.id ?? "new",
    saveHelpCollection: async () => "new",
    deleteHelpArticle: async () => undefined,
  };
  return client as SupportClient;
}

const askAi = async (): Promise<HelpAiResult> => ({
  ok: true,
  output: { answer: "Open Settings, then Billing. Each invoice has a Download button beside it.", citations: [ARTICLES[0]!.id], confident: true },
});

function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function Messenger() {
  const [client] = React.useState(sampleClient);
  return (
    <Providers>
      <div style={{ height: "100vh", maxWidth: 400, margin: "0 auto" }} className="border-x">
        <SupportMessenger client={client} tenantId="acme" greeting="Hi Ada, how can we help?" askAi={askAi} />
      </div>
    </Providers>
  );
}

/** Home, Messages and Help, with an AI answer when you search. */
export const Messenger_: Story = { name: "Messenger", render: () => <Messenger /> };

function Launcher() {
  const [client] = React.useState(sampleClient);
  return (
    <Providers>
      <div style={{ height: "100vh" }}>
        <SupportMessengerLauncher client={client} tenantId="acme" askAi={askAi} refreshInterval={false} />
      </div>
    </Providers>
  );
}

/** The button with its unread count. It opens in the chat dock when the app has one, else a sheet. */
export const Launcher_: Story = { name: "Launcher", render: () => <Launcher /> };

function Admin() {
  const [client] = React.useState(sampleClient);
  const [articleId, setArticleId] = React.useState<string | null>(ARTICLES[0]!.id);
  return (
    <Providers>
      <div style={{ height: "100vh" }}>
        <SupportHelpCenterAdmin client={client} tenantId="acme" articleId={articleId} onArticleChange={setArticleId} />
      </div>
    </Providers>
  );
}

/** Where agents write the help center. */
export const HelpCenterAdmin: Story = { render: () => <Admin /> };
