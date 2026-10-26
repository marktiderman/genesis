// genesis-chat in the sample app: ChatPanel on the in-memory client, so it
// runs with no backend. "Simulate a reply" plays the other side: typing, then
// a message. It also shows topics (the cohort), an away banner (Alex), search
// (the magnifier above the inbox, or in a thread's header) and scheduled send
// (the arrow beside Send; "Send scheduled now" plays the server's runner).
import { useMemo, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button, Toaster, toast } from "@marktiderman/genesis-ui";
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
    availability: {
      [ALEX]: { awayMessage: "At a conference", awayUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(), timeZone: "America/New_York" },
      [BEA]: { timeZone: "Europe/London", hours: { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]] } },
    },
    linkPreviews: [
      { url: "https://github.com/marktiderman/genesis", title: "marktiderman/genesis", description: "A layered contract stack for apps: tokens, primitives, patterns, layouts and data.", siteName: "GitHub" },
    ],
    conversations: [
      {
        id: "cohort",
        title: "Spring cohort",
        members: [{ userId: ME, role: "owner", lastReadSeq: 4 }, { userId: ALEX }, { userId: BEA }, { userId: CAL }],
        topics: [
          { topic: "week-1", title: "Week 1: Habits", closed: true },
          { topic: "week-2", title: "Week 2: Focus" },
        ],
        messages: [
          { id: "k1", senderId: ME, body: "Welcome to the cohort! Each week has its own topic above.", createdAt: minutesAgo(60 * 30) },
          { id: "k2", senderId: BEA, body: "My habit this week: a ten-minute walk after lunch.", topic: "week-1", createdAt: minutesAgo(60 * 29) },
          { id: "k3", senderId: CAL, body: "Mine is reading before bed instead of scrolling.", topic: "week-1", createdAt: minutesAgo(60 * 28) },
          { id: "k4", senderId: ALEX, body: "Focus question: how do you all protect deep work time?", topic: "week-2", createdAt: minutesAgo(30) },
        ],
      },
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
    const from = conversation === "team" || conversation === "cohort" ? CAL : conversation === "news" ? BEA : ALEX;
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void client.sendDue(new Date(Date.now() + 366 * 86_400_000)).then((n) => {
                  toast.info(n ? `Sent ${n} scheduled ${n === 1 ? "message" : "messages"}` : "Nothing scheduled");
                  void queryClient.invalidateQueries();
                })
              }
            >
              Send scheduled now
            </Button>
            <Button variant="outline" size="sm" onClick={simulateReply}>
              Simulate a reply
            </Button>
          </div>
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
