/**
 * @feat:chat
 * `ChatBroadcast`: write one message and send it into many of your conversations at once
 * (each client's direct conversation), so each person gets it on their own and their reply
 * comes back to you privately. Pick conversations from the inbox (filter, select all), then send.
 */
import { useMemo, useState } from "react";
import { Megaphone, Search } from "lucide-react";
import { Alert, AlertDescription, Button, Checkbox, EmptyState, Input, Label, Skeleton, Textarea, UserAvatar, cn, toast } from "@marktiderman/genesis-ui";
import { CHAT_LIMITS } from "../core/media";
import type { ChatInboxItem } from "../core/types";
import { useBroadcast, useInbox } from "../react/index";
import type { ResolveUser } from "./format";
import { inboxTitle } from "./inbox";

export interface ChatBroadcastProps {
  resolveUser: ResolveUser;
  /** Only this kind of conversation (`direct`, say). */
  kind?: string;
  /** Which inbox rows may be picked; every one by default. */
  filter?: (item: ChatInboxItem) => boolean;
  /** Called with how many it went to. */
  onSent?: (sent: number, picked: number) => void;
  className?: string;
}

export function ChatBroadcast({ resolveUser, kind, filter, onSent, className }: ChatBroadcastProps) {
  const { items, isLoading } = useInbox({ kind, limit: 200 });
  const { send, sending } = useBroadcast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      items
        .filter((i) => (filter ? filter(i) : true))
        .map((i) => ({ item: i, title: inboxTitle(i, resolveUser) }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [items, filter, resolveUser],
  );
  const shown = rows.filter((r) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase()));
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.item.conversationId));

  const toggle = (id: string, on: boolean) =>
    setPicked((p) => {
      const next = new Set(p);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    const body = text.trim();
    if (!body || picked.size === 0) return;
    try {
      const ids = await send([...picked], body);
      const n = ids.length;
      if (n === picked.size) toast.success(n === 1 ? "Sent to 1 conversation" : `Sent to ${n} conversations`);
      else toast.warning(`Sent to ${n} of ${picked.size}`, { description: "You can't post in the others." });
      onSent?.(n, picked.size);
      setText("");
      setPicked(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="genesis-chat-broadcast"
    >
      <Alert>
        <Megaphone className="size-4" aria-hidden />
        <AlertDescription>Each person gets this in their own conversation with you, so replies come back to you privately. No one sees who else got it.</AlertDescription>
      </Alert>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="genesis-chat-broadcast-text">Message</Label>
        <Textarea
          id="genesis-chat-broadcast-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_LIMITS.bodyChars}
          className="min-h-24"
          placeholder="Write once, send to everyone you pick"
        />
      </div>

      <fieldset className="flex min-h-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Send to</legend>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter conversations" className="pl-8" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={shown.length === 0}
            onClick={() =>
              setPicked((p) => {
                const next = new Set(p);
                for (const r of shown) {
                  if (allShown) next.delete(r.item.conversationId);
                  else next.add(r.item.conversationId);
                }
                return next;
              })
            }
          >
            {allShown ? "Clear" : "Select all"}
          </Button>
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy aria-label="Loading conversations">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={Megaphone} title={rows.length ? "No matches" : "No conversations yet"} />
        ) : (
          <ul className="max-h-72 overflow-y-auto rounded-md border" aria-label="Conversations">
            {shown.map(({ item, title }) => {
              const id = `genesis-chat-broadcast-${item.conversationId}`;
              const avatar = item.otherUserId ? resolveUser(item.otherUserId).avatarUrl : null;
              return (
                <li key={item.conversationId} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                  <Checkbox id={id} checked={picked.has(item.conversationId)} onCheckedChange={(v) => toggle(item.conversationId, v === true)} />
                  <UserAvatar name={title} src={avatar} size="sm" />
                  <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate font-normal">
                    {title}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {picked.size === 0 ? "Pick who gets it" : picked.size === 1 ? "1 conversation" : `${picked.size} conversations`}
        </span>
        <Button type="submit" loading={sending} disabled={!text.trim() || picked.size === 0} data-testid="genesis-chat-broadcast-send">
          {picked.size > 1 ? `Send to ${picked.size}` : "Send"}
        </Button>
      </div>
    </form>
  );
}
