/**
 * @feat:chat
 * The topic bar: "All" and each of a conversation's topics as a single-choice toggle group
 * (Radix: arrow keys move between them), a lock on closed ones, and, for owners and admins, a
 * menu to start a topic and to close or reopen the one open. ChatThread shows it when the
 * conversation has topics.
 */
import { useState } from "react";
import { Hash, Lock, LockOpen, MoreHorizontal, Plus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  ToggleGroup,
  ToggleGroupItem,
  cn,
  toast,
} from "@marktiderman/genesis-ui";
import { topicKey } from "../core/extras";
import type { ChatTopic, TopicInput } from "../core/types";

export interface ChatTopicBarProps {
  topics: ChatTopic[];
  /** The topic shown; null for "All". */
  value: string | null;
  onValueChange: (topic: string | null) => void;
  /** Owners and admins: "New topic", and close or reopen. */
  canManage?: boolean;
  /** Saves a topic (from useTopics). */
  onSetTopic?: (topic: string, input: TopicInput) => Promise<void>;
  className?: string;
}

const ALL = "__all__";

export function ChatTopicBar({ topics, value, onValueChange, canManage = false, onSetTopic, className }: ChatTopicBarProps) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const current = value ? topics.find((t) => t.topic === value) : undefined;

  const create = async () => {
    const name = title.trim();
    if (!name || !onSetTopic) return;
    const key = topicKey(name);
    if (topics.some((t) => t.topic === key)) {
      toast.error("There's already a topic with that name");
      return;
    }
    setBusy(true);
    try {
      await onSetTopic(key, { title: name, position: topics.length });
      setCreating(false);
      setTitle("");
      onValueChange(key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the topic");
    } finally {
      setBusy(false);
    }
  };

  const toggleClosed = async (t: ChatTopic) => {
    try {
      await onSetTopic?.(t.topic, { closed: !t.closedAt });
      toast.success(t.closedAt ? `Reopened ${t.title}` : `Closed ${t.title}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the topic");
    }
  };

  return (
    <div className={cn("flex items-center gap-1 border-b px-2 py-1.5", className)} data-testid="genesis-chat-topic-bar">
      <ToggleGroup
        type="single"
        value={value ?? ALL}
        onValueChange={(v) => {
          // A single toggle group clears on a second click; keep a choice instead.
          if (v) onValueChange(v === ALL ? null : v);
        }}
        aria-label="Topics"
        className="flex min-w-0 flex-1 justify-start gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        <ToggleGroupItem value={ALL} size="sm" className="h-7 shrink-0 rounded-full px-3 text-xs" data-testid="genesis-chat-topic-all">
          All
        </ToggleGroupItem>
        {topics.map((t) => (
          <ToggleGroupItem
            key={t.topic}
            value={t.topic}
            size="sm"
            className="h-7 shrink-0 gap-1 rounded-full px-3 text-xs"
            aria-label={t.closedAt ? `${t.title} (closed)` : t.title}
            data-testid={`genesis-chat-topic-${t.topic}`}
          >
            {t.closedAt ? <Lock className="size-3" aria-hidden /> : <Hash className="size-3 opacity-60" aria-hidden />}
            <span className="max-w-[10rem] truncate">{t.title}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {canManage && onSetTopic ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 rounded-full" aria-label="Topic options" data-testid="genesis-chat-topic-menu">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="gap-2" onSelect={() => setCreating(true)} data-testid="genesis-chat-topic-new">
              <Plus className="size-4" aria-hidden /> New topic
            </DropdownMenuItem>
            {current ? (
              <DropdownMenuItem className="gap-2" onSelect={() => void toggleClosed(current)} data-testid="genesis-chat-topic-close">
                {current.closedAt ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                {current.closedAt ? "Reopen topic" : "Close topic"}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Dialog open={creating} onOpenChange={(o) => !busy && setCreating(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New topic</DialogTitle>
            <DialogDescription>Messages posted in a topic stay together, under its name.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Label htmlFor="genesis-chat-topic-title">Name</Label>
            <Input id="genesis-chat-topic-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus placeholder="Week 1: Habits" />
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!title.trim()} data-testid="genesis-chat-topic-create">
                Add topic
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
