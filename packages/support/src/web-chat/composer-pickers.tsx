/**
 * The agent composer's pickers: typing `@` in an internal note offers the tenant's agents to
 * mention, `!` the tenant's saved replies, `?` its help articles, in a reply or a note. A trigger
 * counts at the start of the draft or after a space, and what follows it filters; `!` and `?` open
 * only once a letter follows them, so "Merci !" or a "?" on its own is just words. Arrow keys move
 * into the list and Tab inserts; Enter inserts only once the agent has moved into the list with the
 * arrows, and otherwise sends as it always does. Escape closes. A mention goes in as genesis-chat's markdown (`@[Name](user:<uuid>)`), which the
 * database reads to tell the agent (migration 0014); a saved reply with its `{first_name}`-style
 * variables filled; an article as its title and link.
 *
 * Drawn above genesis-ui's `ComposerBar` through `ThreadPage`'s `composer` slot.
 */
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@marktiderman/genesis-ui";
import type { HelpSearchHit, SavedReply, SupportClient } from "../client";
import { fill, type SupportCopy } from "../copy";

export type PickerKind = "mention" | "saved" | "article";

export interface PickerOption {
  id: string;
  label: string;
  detail?: string | undefined;
  /** What replaces the trigger and its query. */
  insert: string;
}

const TRIGGERS: Record<string, PickerKind> = { "@": "mention", "!": "saved", "?": "article" };
const MAX_OPTIONS = 8;

/**
 * The trigger being typed at the end of a draft, if any: its kind, where it starts and what follows
 * it. `!` and `?` are punctuation too ("Merci !", "Ça marche ?"), so they need a character after
 * them; `@` (notes only) doesn't.
 */
export function pickerToken(draft: string): { kind: PickerKind; start: number; query: string } | null {
  const match = /(^|\s)([@!?])([^\s@!?]{0,40})$/.exec(draft);
  if (!match) return null;
  const kind = TRIGGERS[match[2]!];
  if (!kind) return null;
  const query = match[3] ?? "";
  if (kind !== "mention" && !query) return null;
  return { kind, start: match.index + match[1]!.length, query };
}

/** genesis-chat's mention markdown. Brackets and parentheses in a name would break it, so they go. */
export function mentionMarkup(agent: { id: string; name: string }): string {
  const name = agent.name.replace(/[[\]()\n]/g, "").trim().slice(0, 80) || "teammate";
  return `@[${name}](user:${agent.id})`;
}

/** A body with its mentions shown as `@Name`. */
export function showMentions(body: string): string {
  return body.replace(/@\[([^\]\n]{1,80})\]\(user:[0-9a-f-]{36}\)/gi, "@$1");
}

/**
 * A saved reply with its variables filled. A variable that's known and empty (the requester has no
 * name) goes with the space before it, and at the start of a line with the comma after it, so
 * "Hi {first_name}," reads "Hi," and "{first_name}, thanks" reads "thanks". Unknown ones stay as written.
 */
export function fillReply(body: string, variables: Readonly<Record<string, string>>): string {
  const tidied = body
    .replace(/^\{(\w+)\}[,;:]?[ \t]*/gm, (token, name: string) => (variables[name] === "" ? "" : token))
    .replace(/[ \t]*\{(\w+)\}/g, (token, name: string) => (variables[name] === "" ? "" : token));
  return fill(tidied, variables);
}

const matches = (text: string, query: string) => !query || text.toLowerCase().includes(query.toLowerCase());

export interface UseComposerPickerOptions {
  client: SupportClient;
  tenantId: string | null;
  scope: string;
  draft: string;
  setDraft: (draft: string) => void;
  /** Mentions are for internal notes only. */
  note: boolean;
  agents?: readonly { id: string; name: string }[] | undefined;
  /** Filled into a saved reply as it's inserted. */
  variables: Readonly<Record<string, string>>;
  /** An article's link. */
  articleHref: (article: HelpSearchHit) => string;
  copy: SupportCopy;
  onError?: ((error: unknown) => void) | undefined;
}

export interface ComposerPicker {
  open: boolean;
  kind: PickerKind | null;
  options: PickerOption[];
  loading: boolean;
  /** The option the arrows are on, or -1 until the agent moves into the list (Enter sends until then). */
  active: number;
  listId: string;
  optionId: (index: number) => string;
  choose: (index: number) => void;
  /** The composer's keys, before its own: true when a picker key was used. */
  onKeyDown: (event: KeyboardEvent) => boolean;
  setActive: (index: number) => void;
}

/** What the open picker offers, and the keys that drive it. */
export function useComposerPicker({ client, tenantId, scope, draft, setDraft, note, agents, variables, articleHref, copy, onError }: UseComposerPickerOptions): ComposerPicker {
  const listId = useId();
  const token = pickerToken(draft);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  // Whether the agent has moved into the list with the arrows: only then does Enter insert.
  const [engaged, setEngaged] = useState(false);
  const kind = token && token.start !== dismissed ? token.kind : null;
  const usable = kind === "mention" ? note && Boolean(agents?.length) : kind === "saved" ? Boolean(client.savedReplies) : kind === "article" ? Boolean(client.searchHelp && client.helpArticles) : false;
  const query = token?.query ?? "";

  const saved = useQuery({
    queryKey: ["genesis-support", "saved-replies", scope],
    queryFn: () => client.savedReplies!({ tenantId }),
    enabled: usable && kind === "saved",
    staleTime: 60_000,
  });
  const articles = useQuery({
    queryKey: ["genesis-support", "composer-articles", scope, query],
    queryFn: async (): Promise<HelpSearchHit[]> =>
      query ? client.searchHelp!(query, { tenantId, limit: MAX_OPTIONS }) : (await client.helpArticles!({ tenantId })).filter((a) => a.status === "published"),
    enabled: usable && kind === "article",
    staleTime: 60_000,
  });
  const failed = saved.error ?? articles.error;
  useEffect(() => {
    if (failed) onError?.(failed);
  }, [failed, onError]);

  const options = useMemo<PickerOption[]>(() => {
    if (!usable) return [];
    if (kind === "mention") {
      return (agents ?? [])
        .filter((a) => matches(a.name, query))
        .slice(0, MAX_OPTIONS)
        .map((a) => ({ id: a.id, label: a.name, insert: `${mentionMarkup(a)} ` }));
    }
    if (kind === "saved") {
      return (saved.data ?? [])
        .filter((r: SavedReply) => matches(r.title, query))
        .slice(0, MAX_OPTIONS)
        .map((r) => ({ id: r.id, label: r.title, detail: r.body.split("\n")[0], insert: fillReply(r.body, variables) }));
    }
    if (kind === "article") {
      return (articles.data ?? []).slice(0, MAX_OPTIONS).map((a) => ({
        id: a.id,
        label: a.title,
        ...(a.summary ? { detail: a.summary } : {}),
        insert: fill(copy.agentInbox.articleLink, { title: a.title, url: articleHref(a) }),
      }));
    }
    return [];
  }, [usable, kind, agents, query, saved.data, articles.data, variables, articleHref, copy]);

  // A new list starts at its first option, with Enter sending until the agent moves into it.
  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [kind, query]);
  // Typing a new trigger reopens what Escape closed.
  useEffect(() => {
    if (dismissed !== null && token?.start !== dismissed) setDismissed(null);
  }, [dismissed, token?.start]);

  const open = Boolean(kind && usable);
  const choose = (index: number) => {
    const option = options[index];
    if (!option || !token) return;
    setDraft(`${draft.slice(0, token.start)}${option.insert}`);
  };

  return {
    open,
    kind: open ? kind : null,
    options,
    loading: open && ((kind === "saved" && saved.isPending) || (kind === "article" && articles.isPending)),
    active: engaged && options.length ? Math.min(active, options.length - 1) : -1,
    listId,
    optionId: (index) => `${listId}-option-${index}`,
    setActive,
    choose,
    onKeyDown(event) {
      if (!open) return false;
      if (event.key === "Escape") {
        setDismissed(token?.start ?? null);
        return true;
      }
      if (!options.length) return false;
      if (event.key === "ArrowDown") {
        // The first press moves into the list, onto its first option.
        setActive((i) => (engaged ? (i + 1) % options.length : 0));
        setEngaged(true);
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((i) => (engaged ? (i - 1 + options.length) % options.length : options.length - 1));
        setEngaged(true);
        return true;
      }
      if ((engaged && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) || event.key === "Tab") {
        choose(Math.min(active, options.length - 1));
        return true;
      }
      return false;
    },
  };
}

/** The open picker's list, above the composer. */
export function ComposerPickerList({ picker, copy, testID }: { picker: ComposerPicker; copy: SupportCopy; testID: string }): ReactNode {
  if (!picker.open || !picker.kind) return null;
  const label = picker.kind === "mention" ? copy.agentInbox.mentionsLabel : picker.kind === "saved" ? copy.agentInbox.savedRepliesLabel : copy.agentInbox.articlesLabel;
  return (
    <div data-testid={testID} className="mx-1 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-sm">
      <p className="px-3 pt-2 text-xs font-medium text-muted-foreground" id={`${picker.listId}-label`}>
        {label}
      </p>
      {picker.loading ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">{copy.agentInbox.pickerLoading}</p>
      ) : picker.options.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground" data-testid={`${testID}-empty`}>
          {copy.agentInbox.pickerEmpty}
        </p>
      ) : (
        <ul role="listbox" id={picker.listId} aria-labelledby={`${picker.listId}-label`} className="flex flex-col p-1">
          {picker.options.map((option, index) => (
            <li
              key={option.id}
              id={picker.optionId(index)}
              role="option"
              aria-selected={index === picker.active}
              data-testid={`${testID}-option-${option.id}`}
              // Keep focus in the composer: choosing must not blur it.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => picker.choose(index)}
              className={cn("flex min-h-11 cursor-pointer flex-col justify-center rounded-sm px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground", index === picker.active && "bg-accent text-accent-foreground")}
            >
              <span className="truncate font-medium">{option.label}</span>
              {option.detail ? <span className="truncate text-xs text-muted-foreground">{option.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
