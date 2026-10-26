/**
 * @feat:chat
 * `ChatSearch`: a search box and its results, across all your conversations or in one. Each
 * result shows who, when, where (across conversations) and the snippet with the matched words
 * highlighted; hits in a voice note's or video's transcript are marked. Choosing one calls
 * `onOpen`, which the thread uses to jump to the message. Arrow keys move through the results.
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { Mic, Search, X } from "lucide-react";
import { Badge, Button, EmptyState, Input, Skeleton, cn } from "@marktiderman/genesis-ui";
import { snippetParts } from "../core/extras";
import type { ChatSearchHit } from "../core/types";
import { useSearch } from "../react/index";
import { relativeTime, type ResolveUser } from "./format";

export interface ChatSearchProps {
  resolveUser: ResolveUser;
  /** Search one conversation; all of yours without it. */
  conversationId?: string | null;
  /** Called with the chosen result. */
  onOpen: (hit: ChatSearchHit) => void;
  /** Names a conversation, on results across conversations. */
  conversationTitle?: (conversationId: string) => string;
  /** Start with the box focused. */
  autoFocus?: boolean;
  debounceMs?: number;
  className?: string;
}

/** A snippet with its « » marks as <mark>. */
export function SearchSnippet({ snippet, className }: { snippet: string; className?: string }) {
  return (
    <span className={className}>
      {snippetParts(snippet).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-warning/30 px-0.5 text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

export function ChatSearch({ resolveUser, conversationId, onOpen, conversationTitle, autoFocus, debounceMs, className }: ChatSearchProps) {
  const [value, setValue] = useState("");
  const { hits, query, isSearching } = useSearch(value, { conversationId, debounceMs });
  const list = useRef<HTMLUListElement>(null);

  // Native buttons in a list; the arrows are added here (no Radix primitive is a vertical list of buttons).
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button[data-search-hit]") ?? []);
    if (!buttons.length) return;
    e.preventDefault();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? Math.min(buttons.length - 1, at + 1) : at <= 0 ? -1 : at - 1;
    if (to < 0) (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus();
    else buttons[to]?.focus();
  };

  const short = value.trim().length < 2;
  return (
    <div className={cn("flex min-h-0 flex-col", className)} onKeyDown={onKeyDown} data-testid="genesis-chat-search" role="search">
      <div className="relative p-2">
        <Search className="pointer-events-none absolute left-4.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={conversationId ? "Search this conversation" : "Search messages"}
          aria-label={conversationId ? "Search this conversation" : "Search messages"}
          autoFocus={autoFocus}
          className="pl-8 pr-8"
          data-testid="genesis-chat-search-input"
        />
        {value ? (
          <Button type="button" variant="ghost" size="icon" className="absolute right-3 top-1/2 size-6 -translate-y-1/2" onClick={() => setValue("")} aria-label="Clear search">
            <X />
          </Button>
        ) : null}
      </div>
      <div className="sr-only" aria-live="polite">
        {short || isSearching ? "" : hits.length === 0 ? "No results" : hits.length === 1 ? "1 result" : `${hits.length} results`}
      </div>
      {short ? null : isSearching && hits.length === 0 ? (
        <div className="flex flex-col gap-2 p-3" aria-busy aria-label="Searching">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : hits.length === 0 ? (
        <EmptyState icon={Search} title="No results" description={`Nothing matches “${query}”.`} />
      ) : (
        <ul ref={list} className="min-h-0 flex-1 overflow-y-auto" aria-label="Results">
          {hits.map((h) => {
            const who = h.senderId ? resolveUser(h.senderId).name : "Someone";
            return (
              <li key={`${h.messageId}:${h.inTranscript}`}>
                <button
                  type="button"
                  data-search-hit
                  onClick={() => onOpen(h)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  data-testid="genesis-chat-search-hit"
                >
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{who}</span>
                    {!conversationId && conversationTitle ? <span className="truncate">in {conversationTitle(h.conversationId)}</span> : null}
                    <span className="ml-auto shrink-0">{relativeTime(h.createdAt)}</span>
                  </span>
                  <span className="flex items-start gap-1.5 text-sm">
                    {h.inTranscript ? (
                      <Badge variant="secondary" className="mt-0.5 shrink-0 gap-1 px-1.5 py-0 text-[10px]" data-testid="genesis-chat-search-transcript">
                        <Mic className="size-3" aria-hidden /> Transcript
                      </Badge>
                    ) : null}
                    <SearchSnippet snippet={h.snippet} className="line-clamp-2" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
