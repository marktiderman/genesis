import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComposerBar, InboxLayout, InboxPage, InboxViews, ThreadList, ThreadPage } from "@marktiderman/genesis-ui";
import type { InboxItem, ThreadMessage } from "@marktiderman/genesis-core/conversation";

const meta: Meta = {
  title: "Patterns/Messaging",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const at = (minAgo: number) => new Date(Date.UTC(2026, 10, 3, 12, 0) - minAgo * 60_000).toISOString();
const thread: ThreadMessage[] = [
  { id: "1", body: "The export button on Reports does nothing for me.", mine: false, authorName: "Ada Lovelace", timestamp: at(42) },
  { id: "2", body: "Thanks Ada, looking now. Which browser?", mine: true, timestamp: at(40) },
  { id: "e", kind: "event", body: "Sam assigned this to you", mine: false, timestamp: at(39) },
  { id: "3", body: "Safari on a Mac.", mine: false, authorName: "Ada Lovelace", timestamp: at(35) },
  { id: "4", body: "Repro'd on Safari only.", mine: true, tone: "internal", timestamp: at(30) },
  { id: "5", body: "It also happens on the Invoices page.", mine: false, authorName: "Ada Lovelace", timestamp: at(4) },
];
const items: InboxItem[] = [
  { id: "c1", title: "Ada Lovelace", preview: "It also happens on the Invoices page.", timestamp: at(4), unreadCount: 1, meta: "Team, 12 seats" },
  { id: "c2", title: "Grace Hopper", preview: "You: Done, it's in your inbox.", timestamp: at(280), meta: "Starter" },
  { id: "c3", title: "Alan Turing", preview: "Also, does it work offline?", timestamp: at(1500), unread: true, meta: "Trial" },
];

function useThread(initial: ThreadMessage[]) {
  const [messages, setMessages] = React.useState(initial);
  const [draft, setDraft] = React.useState("");
  const [mode, setMode] = React.useState("reply");
  const send = () => {
    if (!draft.trim()) return;
    setMessages((m) => [...m, { id: `n${m.length}`, body: draft.trim(), mine: true, timestamp: new Date().toISOString(), tone: mode === "note" ? "internal" : undefined }]);
    setDraft("");
  };
  return {
    messages,
    composer: { value: draft, onChangeText: setDraft, onSend: send, mode, onModeChange: setMode, modes: [{ id: "reply", label: "Reply" }, { id: "note", label: "Internal note", tone: "internal" as const }] },
  };
}

/** The three-pane inbox: views, conversations, the open thread and its details. */
export const Inbox: Story = {
  render: function Render() {
    const [view, setView] = React.useState("mine");
    const [openId, setOpenId] = React.useState<string | null>("c1");
    const { messages, composer } = useThread(thread);
    return (
      <div style={{ height: 600 }}>
        <InboxLayout
          views={<InboxViews views={[{ id: "mine", label: "Mine", count: 2 }, { id: "unassigned", label: "Unassigned", count: 1 }]} activeId={view} onSelect={setView} />}
          list={<InboxPage items={items} selectedId={openId} onSelect={setOpenId} />}
          thread={openId ? <ThreadPage conversationId={openId} messages={messages} firstUnreadId="5" composer={composer} sendOn="mod-enter" /> : null}
          context={<div className="p-4 text-sm">Ada Lovelace · ada@acme.test</div>}
          threadOpen={openId !== null}
          onBack={() => setOpenId(null)}
        />
      </div>
    );
  },
};

/** One conversation: events, an internal note, the unread divider and the composer. */
export const Thread: Story = {
  render: function Render() {
    const { messages, composer } = useThread(thread);
    return (
      <div style={{ height: 520 }}>
        <ThreadPage messages={messages} firstUnreadId="5" composer={composer} />
      </div>
    );
  },
};

/** The conversation list on its own. */
export const List: Story = {
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <InboxPage items={items} selectedId="c1" onSelect={() => {}} sectionTitle="Mine" />
    </div>
  ),
};

/** The list and composer atoms, for a thread of your own. */
export const Atoms: Story = {
  render: function Render() {
    const [value, setValue] = React.useState("");
    return (
      <div style={{ height: 420, display: "flex", flexDirection: "column", maxWidth: 520 }}>
        <ThreadList data={thread} keyExtractor={(m) => m.id} renderItem={(m) => <p className="py-1 text-sm">{m.body}</p>} />
        <ComposerBar value={value} onChangeText={setValue} onSend={() => setValue("")} />
      </div>
    );
  },
};
