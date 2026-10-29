/** Messages: genesis-chat's panel on its in-memory client, with each organization's own threads. */
import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatProvider } from "@marktiderman/genesis-chat/react";
import { ChatPanel, createMemoryChatClient } from "@marktiderman/genesis-chat/web";
import { Button } from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";
import { useDemo } from "../demo/context";

const ME = "00000000-0000-4000-8000-0000000000a1";
const STAFF = "00000000-0000-4000-8000-0000000000a2";
const CLIENT = "00000000-0000-4000-8000-0000000000a3";
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export default function DemoChat() {
  const { org, role } = useDemo();
  const name = org?.name ?? "the studio";
  const people: Record<string, string> = { [ME]: "You", [STAFF]: role === "client" ? `${name} team` : "Robin (staff)", [CLIENT]: org?.clientNoun ?? "Client" };
  const [queryClient] = useState(() => new QueryClient());
  const client = useMemo(
    () =>
      createMemoryChatClient({
        me: ME,
        conversations: [
          {
            id: "thread",
            members: [{ userId: ME, lastReadSeq: 1 }, { userId: role === "client" ? STAFF : CLIENT }],
            messages: [
              { id: "m1", senderId: role === "client" ? STAFF : CLIENT, body: `Hi! A quick question about my next booking with ${name}.`, createdAt: ago(90) },
              { id: "m2", senderId: ME, body: "Of course: what would you like to change?", createdAt: ago(80) },
              { id: "m3", senderId: role === "client" ? STAFF : CLIENT, body: "Could we move it to Thursday?", createdAt: ago(5) },
            ],
          },
          ...(role === "client"
            ? []
            : [
                {
                  id: "team",
                  title: `${name} team`,
                  members: [{ userId: ME, role: "owner" as const, lastReadSeq: 1 }, { userId: STAFF }],
                  messages: [{ id: "t1", senderId: STAFF, body: "Reminder: the weekly review is at 4.", createdAt: ago(240) }],
                },
              ]),
        ],
      }),
    [name, role],
  );
  const [selected, setSelected] = useState<string | null>("thread");
  const reply = () => {
    const conversation = selected ?? "thread";
    const from = conversation === "team" ? STAFF : role === "client" ? STAFF : CLIENT;
    client.activity(conversation, from, "typing");
    setTimeout(() => client.receive(conversation, from, "Thanks, that works!"), 1200);
  };
  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col gap-4">
      <PageHeader
        title="Messages"
        subtitle="genesis-chat on its in-memory client: replies, reactions and read state, nothing sent anywhere."
        actions={<Button testID="demo-ws-chat-button-1" variant="outline" size="sm" onClick={reply}>Simulate a reply</Button>}
      />
      <QueryClientProvider client={queryClient}>
        <ChatProvider key={`${org?.id}-${role}`} client={client} userId={ME}>
          <ChatPanel resolveUser={(id) => ({ name: people[id] ?? "Someone" })} selectedId={selected} onSelectedChange={setSelected} className="min-h-0 flex-1" />
        </ChatProvider>
      </QueryClientProvider>
    </div>
  );
}
