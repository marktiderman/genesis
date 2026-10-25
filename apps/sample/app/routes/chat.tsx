// genesis-chat in the sample app: ChatPanel on the in-memory client, so it
// runs with no backend. "Simulate a reply" plays the other side: typing, then
// a message.
import { useMemo, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Toaster } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/data";
import { ChatProvider } from "@marktiderman/genesis-chat/react";
import { ChatPanel, createMemoryChatClient } from "@marktiderman/genesis-chat/web";

const ME = "00000000-0000-4000-8000-000000000001";
const ALEX = "00000000-0000-4000-8000-000000000002";
const BEA = "00000000-0000-4000-8000-000000000003";
const CAL = "00000000-0000-4000-8000-000000000004";
const PEOPLE: Record<string, string> = { [ME]: "You", [ALEX]: "Alex Rivera", [BEA]: "Bea Chen", [CAL]: "Cal Okafor" };
const resolveUser = (id: string) => ({ name: PEOPLE[id] ?? "Someone" });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function makeClient() {
  return createMemoryChatClient({
    me: ME,
    conversations: [
      {
        id: "dm-alex",
        members: [{ userId: ME, lastReadSeq: 2 }, { userId: ALEX }],
        messages: [
          { id: "a1", senderId: ALEX, body: "Morning! Did you see the new **chat** package?", createdAt: minutesAgo(60 * 26) },
          { id: "a2", senderId: ME, body: "I did. Replies, reactions and voice notes, all on Genesis UI.", createdAt: minutesAgo(60 * 25) },
          { id: "a3", senderId: ALEX, body: "Try right-clicking a message, or hovering it.", createdAt: minutesAgo(12), reactions: [{ emoji: "👍", userId: ME }] },
          { id: "a4", senderId: ALEX, body: "And `code`, _italics_ and links work: https://github.com/marktiderman/genesis", replyToId: "a2", createdAt: minutesAgo(11) },
        ],
      },
      {
        id: "team",
        title: "Launch team",
        members: [{ userId: ME, lastReadSeq: 3 }, { userId: ALEX }, { userId: BEA }, { userId: CAL }],
        pins: ["t2"],
        messages: [
          { id: "t1", kind: "system", body: "Bea created the conversation", createdAt: minutesAgo(90) },
          { id: "t2", senderId: BEA, body: "Launch checklist is in the shared doc. Please tick your items by Friday.", createdAt: minutesAgo(80) },
          { id: "t3", senderId: CAL, body: "On it.", createdAt: minutesAgo(79), reactions: [{ emoji: "🙏", userId: BEA }] },
          { id: "t4", senderId: CAL, body: "", createdAt: minutesAgo(78), attachments: [{ kind: "file", name: "checklist.pdf", bytes: 248_000, mime: "application/pdf" }] },
          { id: "t5", senderId: ALEX, body: `@[Bea Chen](user:${BEA}) can we move the review to Thursday?`, mentions: [BEA], createdAt: minutesAgo(5) },
        ],
      },
      {
        id: "news",
        title: "Announcements",
        settings: { who_posts: "admins" },
        canPost: false,
        muted: true,
        members: [{ userId: ME }, { userId: BEA, role: "admin" }, { userId: ALEX }],
        messages: [{ id: "n1", senderId: BEA, body: "Office closed on Monday for the holiday.", createdAt: minutesAgo(60 * 50) }],
      },
    ],
  });
}

export default function Chat() {
  const [queryClient] = useState(() => new QueryClient());
  const client = useMemo(makeClient, []);
  const [selected, setSelected] = useState<string | null>("dm-alex");

  const simulateReply = () => {
    const conversation = selected ?? "dm-alex";
    const from = conversation === "team" ? CAL : conversation === "news" ? BEA : ALEX;
    client.activity(conversation, from, "typing");
    setTimeout(() => client.receive(conversation, from, "Sounds good, talk soon!"), 1500);
  };

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col gap-4">
      <PageHeader
        title="Chat"
        subtitle="@marktiderman/genesis-chat/web: inbox, thread and composer on Genesis UI, here on the in-memory client."
        icon={MessagesSquare}
        actions={
          <Button variant="outline" size="sm" onClick={simulateReply}>
            Simulate a reply
          </Button>
        }
      />
      <QueryClientProvider client={queryClient}>
        <ChatProvider client={client} userId={ME}>
          <ChatPanel resolveUser={resolveUser} selectedId={selected} onSelectedChange={setSelected} className="min-h-0 flex-1" />
        </ChatProvider>
      </QueryClientProvider>
      <Toaster />
    </div>
  );
}
