/**
 * @feat:chat
 * Messages, whole: the inbox on the left and the open conversation on the
 * right (Genesis `Split`); on a narrow screen one at a time, with a back
 * button from the conversation to the inbox. Search across every conversation
 * sits above the inbox; a result opens its conversation at the message.
 */
import { useState, type ReactNode } from "react";
import { MessageSquare, Search, X } from "lucide-react";
import { Button, EmptyState, Split, cn } from "@marktiderman/genesis-ui";
import { renderSlot, type SlotOverride } from "@marktiderman/genesis-core/slots";
import type { ChatInboxItem } from "../core/types";
import { useInbox } from "../react/index";
import { ChatInbox, inboxTitle, type ChatInboxProps } from "./inbox";
import { ChatSearch } from "./search";
import type { ResolveUser } from "./format";
import { ChatThread, type ChatThreadProps } from "./thread";

export interface ChatPanelNoSelectionProps {
  /** Words under the title; "Pick one on the left to read and reply." by default. */
  hint?: string;
}

export interface ChatPanelProps {
  resolveUser: ResolveUser;
  /** The open conversation (controlled). */
  selectedId?: string | null;
  /** The conversation open at first (uncontrolled). */
  defaultSelectedId?: string | null;
  /** Called when a conversation is opened, or with null on back. Put it in the URL to make it bookmarkable. */
  onSelectedChange?: (conversationId: string | null) => void;
  /** Above the inbox list: a title, a "New message" button. */
  inboxHeader?: ReactNode;
  inboxProps?: Partial<Omit<ChatInboxProps, "resolveUser" | "onSelect" | "selectedId">>;
  threadProps?: Partial<Omit<ChatThreadProps, "conversationId" | "resolveUser" | "onBack">>;
  /** What the right pane shows before a conversation is chosen. */
  slots?: { noSelection?: SlotOverride<ChatPanelNoSelectionProps> };
  /** Search across every conversation, above the inbox. Default true. */
  search?: boolean;
  className?: string;
}

function NoSelection({ hint }: ChatPanelNoSelectionProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={MessageSquare} title="Choose a conversation" description={hint ?? "Pick one on the left to read and reply."} />
    </div>
  );
}

export function ChatPanel({
  resolveUser,
  selectedId: controlled,
  defaultSelectedId = null,
  onSelectedChange,
  inboxHeader,
  inboxProps,
  threadProps,
  slots,
  search = true,
  className,
}: ChatPanelProps) {
  const [own, setOwn] = useState<string | null>(defaultSelectedId);
  const [searching, setSearching] = useState(false);
  const [jump, setJump] = useState<{ messageId: string; seq?: number } | null>(null);
  const { items } = useInbox({ kind: inboxProps?.kind });
  const titleOf = (id: string) => {
    const item = items.find((i: ChatInboxItem) => i.conversationId === id);
    return item ? inboxTitle(item, resolveUser, inboxProps?.fallbackTitle) : "a conversation";
  };
  const selected = controlled !== undefined ? controlled : own;
  const select = (id: string | null) => {
    if (controlled === undefined) setOwn(id);
    onSelectedChange?.(id);
  };

  return (
    <Split
      ratio="1/3"
      at="md"
      gap="none"
      testID="genesis-chat-panel"
      className={cn(
        "h-full min-h-0 overflow-hidden rounded-lg border bg-background",
        "[&>[data-slot=split-start]]:min-h-0 [&>[data-slot=split-end]]:min-h-0 max-md:[&>[data-slot]]:flex-1",
        selected ? "max-md:[&>[data-slot=split-start]]:hidden" : "max-md:[&>[data-slot=split-end]]:hidden",
        className,
      )}
      start={
        <div className="flex h-full min-h-0 flex-col md:border-r">
          {inboxHeader || search ? (
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
              <div className="min-w-0 flex-1">{inboxHeader}</div>
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setSearching((s) => !s)}
                  aria-label={searching ? "Close search" : "Search messages"}
                  aria-pressed={searching}
                  data-testid="genesis-chat-panel-search"
                >
                  {searching ? <X /> : <Search />}
                </Button>
              ) : null}
            </div>
          ) : null}
          {searching ? (
            <ChatSearch
              resolveUser={resolveUser}
              autoFocus
              conversationTitle={titleOf}
              onOpen={(hit) => {
                setJump({ messageId: hit.messageId, seq: hit.seq });
                select(hit.conversationId);
              }}
              className="min-h-0 flex-1"
            />
          ) : (
            <ChatInbox {...inboxProps} resolveUser={resolveUser} selectedId={selected} onSelect={(id) => { setJump(null); select(id); }} className={cn("min-h-0 flex-1 overflow-y-auto", inboxProps?.className)} />
          )}
        </div>
      }
      end={
        selected ? (
          <ChatThread key={selected} {...threadProps} jumpTo={jump} conversationId={selected} resolveUser={resolveUser} onBack={() => select(null)} backClassName="md:hidden" />
        ) : (
          renderSlot(NoSelection, slots?.noSelection, {})
        )
      }
    />
  );
}
