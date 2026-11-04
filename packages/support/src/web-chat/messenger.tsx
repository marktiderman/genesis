/**
 * The help desk's messenger on the web: Home (a greeting, article search, the latest conversation),
 * Messages and Help. A person finds an answer, gets one from the AI when the tenant has it on, or
 * sends a message that becomes a ticket in the tenant's inbox, with the reply arriving live.
 *
 * `SupportMessenger` fills whatever holds it. `SupportMessengerLauncher` is a button that opens it
 * in the chat dock when the app has one (`ChatDockProvider`), else in a sheet.
 *
 * Needs a TanStack QueryClientProvider, and a support client made with the `chat` option for live
 * threads. Lists and threads are genesis-ui's `InboxPage` and `ThreadPage`.
 *
 * @stability Beta
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MessageCircle } from "lucide-react";
import {
  Button,
  EmptyState,
  InboxPage,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  Textarea,
  ThreadPage,
  cn,
  type InboxItem,
  type ThreadMessage,
} from "@marktiderman/genesis-ui";
import { useOptionalChatDock, type ResolveUser } from "@marktiderman/genesis-chat/web";
import { reportHeading, SupportError, type HelpArticleSummary, type HelpSearchHit, type SupportClient, type Ticket } from "../client";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { useHelpAsk, type HelpAnswerResponse, type UseHelpAsk } from "../help-ask";
import type { FeedbackContext } from "../record";
import { ThreadFileAttachment, ThreadFilesContext, threadAttachments, threadFiles } from "./thread-files";

export type MessengerSpace = "home" | "messages" | "help";

export const supportMessengerKeys = {
  all: ["genesis-support", "messenger"] as const,
  tickets: (tenantId: string | null) => ["genesis-support", "messenger", "tickets", tenantId] as const,
  ticket: (id: string) => ["genesis-support", "messenger", "ticket", id] as const,
  replies: (id: string) => ["genesis-support", "messenger", "replies", id] as const,
  collections: (tenantId: string | null) => ["genesis-support", "messenger", "collections", tenantId] as const,
  articles: (tenantId: string | null, collectionId: string | null) => ["genesis-support", "messenger", "articles", tenantId, collectionId] as const,
  article: (tenantId: string | null, slug: string) => ["genesis-support", "messenger", "article", tenantId, slug] as const,
  search: (tenantId: string | null, query: string) => ["genesis-support", "messenger", "search", tenantId, query] as const,
  ai: (tenantId: string | null) => ["genesis-support", "messenger", "ai", tenantId] as const,
};

export interface SupportMessengerProps {
  /** A support client, made with the `chat` option for live threads. */
  client: SupportClient;
  /** Whose help desk: the viewer's current workspace. Null is the app's own. Left out, the client's `tenantId`, else the app's own. */
  tenantId?: string | null;
  /** Which spaces to offer, in order. Default Home, Messages, Help. */
  spaces?: readonly MessengerSpace[];
  /** Over the search on Home. Default the copy's "How can we help?". */
  greeting?: string;
  /** Calls your endpoint for `answerHelpQuestion` (`/ai`). Without it, or with the tenant's AI off, search is all there is. */
  askAi?: (questionId: string) => Promise<HelpAnswerResponse>;
  /** The person hasn't agreed to share with the AI's vendor: opens your screen for that. Without it, they're told and offered a person. */
  onAiConsent?: () => void;
  /** Whether it's in front of the person. False pauses marking read (`SupportMessengerLauncher` sets it when the dock minimizes it). Default true. */
  active?: boolean;
  /** Names who replies. Default "Support", so people don't learn agents' names unless you say. */
  resolveUser?: ResolveUser;
  /** What's sent with a new message: the page they're on, the app's version. Default the path of the page. */
  context?: () => FeedbackContext;
  copy?: SupportCopyOverrides;
  /** Every refused or failed read and change, for reporting. */
  onError?: (error: unknown) => void;
  className?: string;
}

type Screen =
  | { name: "space"; space: MessengerSpace }
  | { name: "compose"; from: Screen }
  | { name: "ticket"; id: string; from: Screen }
  | { name: "collection"; id: string; title: string; from: Screen }
  | { name: "article"; slug: string; from: Screen };

const SPACES: readonly MessengerSpace[] = ["home", "messages", "help"];
const CLOSED = new Set<string>(["addressed", "wont_fix"]);

const defaultContext = (): FeedbackContext => ({
  platform: "web",
  ...(typeof window !== "undefined" ? { route: window.location.pathname } : {}),
});

function required<T>(method: T | undefined): NonNullable<T> {
  if (!method) throw new SupportError("This support client has no help center.", "0A000", "messenger");
  return method as NonNullable<T>;
}

interface Shared {
  client: SupportClient;
  tenantId: string | null | undefined;
  copy: SupportCopy;
  go: (screen: Screen) => void;
  here: Screen;
  report: (error: unknown) => void;
}

function ticketItems(tickets: readonly Ticket[], copy: SupportCopy, open: (id: string) => void): InboxItem[] {
  return tickets.map((t) => ({
    id: t.id,
    title: reportHeading(t),
    timestamp: t.lastStaffReplyAt ?? t.createdAt,
    unread: t.unread,
    meta: copy.status[t.status],
    onPress: () => open(t.id),
  }));
}

function articleItems(articles: readonly (HelpArticleSummary | HelpSearchHit)[], open: (slug: string) => void): InboxItem[] {
  return articles.map((a) => ({ id: a.id, title: a.title, ...(a.summary ? { preview: a.summary } : {}), onPress: () => open(a.slug) }));
}

/** A search box that says what it is. */
function SearchForm({ copy, initial, onSearch }: { copy: SupportCopy; initial: string; onSearch: (query: string) => void }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };
  return (
    <form role="search" onSubmit={submit} className="flex items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={id} className="sr-only">
          {copy.messenger.searchLabel}
        </Label>
        <Input id={id} type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={copy.messenger.searchPlaceholder} data-testid="genesis-support-messenger-search" />
      </div>
      <Button type="submit" variant="secondary" data-testid="genesis-support-messenger-search-go">
        {copy.messenger.search}
      </Button>
    </form>
  );
}

function Home({ client, tenantId, copy, go, here, report, greeting, onSearch }: Shared & { greeting: string | undefined; onSearch: ((query: string) => void) | null }) {
  const tickets = useQuery({ queryKey: supportMessengerKeys.tickets(tenantId ?? null), queryFn: () => required(client.ticketsInTenant)(tenantId === undefined ? {} : { tenantId }) });
  const articles = useQuery({ queryKey: supportMessengerKeys.articles(tenantId ?? null, null), queryFn: () => required(client.helpArticles)(tenantId === undefined ? {} : { tenantId }) });
  useReported(tickets.error, report);
  useReported(articles.error, report);
  const latest = tickets.data?.[0];
  return (
    <div data-testid="genesis-support-messenger-home" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-lg font-semibold">{greeting ?? copy.messenger.greeting}</h2>
      {onSearch ? <SearchForm copy={copy} initial="" onSearch={onSearch} /> : null}
      <Button onClick={() => go({ name: "compose", from: here })} data-testid="genesis-support-messenger-new">
        {copy.messenger.newMessage}
      </Button>
      {latest ? (
        <InboxPage
          testID="genesis-support-messenger-latest"
          className="flex-none overflow-visible rounded-md border"
          sectionTitle={copy.messenger.recent}
          sectionTitleLevel={3}
          label={copy.messenger.recent}
          hasMore={false}
          items={ticketItems([latest], copy, (id) => go({ name: "ticket", id, from: here }))}
        />
      ) : null}
      {articles.data?.length ? (
        <InboxPage
          testID="genesis-support-messenger-popular"
          className="flex-none overflow-visible rounded-md border"
          sectionTitle={copy.messenger.popular}
          sectionTitleLevel={3}
          label={copy.messenger.popular}
          hasMore={false}
          items={articleItems(articles.data.slice(0, 5), (slug) => go({ name: "article", slug, from: here }))}
        />
      ) : null}
    </div>
  );
}

function Messages({ client, tenantId, copy, go, here, report }: Shared) {
  const tickets = useQuery({ queryKey: supportMessengerKeys.tickets(tenantId ?? null), queryFn: () => required(client.ticketsInTenant)(tenantId === undefined ? {} : { tenantId }) });
  useReported(tickets.error, report);
  const items = useMemo(() => ticketItems(tickets.data ?? [], copy, (id) => go({ name: "ticket", id, from: here })), [tickets.data, copy, go, here]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InboxPage
        testID="genesis-support-messenger-messages"
        items={items}
        loading={tickets.isPending}
        error={tickets.isError}
        errorTitle={copy.messenger.messagesErrorTitle}
        errorBody={copy.messenger.errorBody}
        emptyTitle={copy.messenger.messagesEmptyTitle}
        emptyBody={copy.messenger.messagesEmptyBody}
        emptyActionLabel={copy.messenger.newMessage}
        onEmptyAction={() => go({ name: "compose", from: here })}
        hasMore={false}
        label={copy.messenger.spaces.messages}
      />
      {items.length ? (
        <div className="border-t p-3">
          <Button className="w-full" onClick={() => go({ name: "compose", from: here })} data-testid="genesis-support-messenger-new">
            {copy.messenger.newMessage}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The AI's answer, or that it has none, always with the way to a person. */
function AnswerCard({ ask, query, titles, onConsent, copy, go, here, report }: { ask: UseHelpAsk; query: string; titles: ReadonlyMap<string, { slug: string; title: string }>; onConsent: (() => void) | undefined } & Pick<Shared, "copy" | "go" | "here" | "report">) {
  const { state } = ask;
  const [failed, setFailed] = useState(false);
  const [handing, setHanding] = useState(false);
  if (state.phase === "idle") {
    // The person's choice: their words go to the AI's vendor only when they ask.
    return query ? (
      <div className="flex flex-col gap-1">
        <Button variant="outline" onClick={() => void ask.ask(query)} data-testid="genesis-support-messenger-ai-ask">
          {copy.messenger.aiAsk}
        </Button>
        <p className="text-xs text-muted-foreground">{copy.messenger.aiAskHint}</p>
      </div>
    ) : null;
  }
  if (state.phase === "asking") {
    return (
      <div role="status" data-testid="genesis-support-messenger-ai-asking" className="flex flex-col gap-2 rounded-md border p-3">
        <p className="text-sm text-muted-foreground">{copy.messenger.aiThinking}</p>
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  const person = () => {
    setHanding(true);
    setFailed(false);
    ask
      .toPerson()
      .then((id) => go({ name: "ticket", id, from: here }))
      .catch((error: unknown) => {
        setFailed(true);
        report(error);
      })
      .finally(() => setHanding(false));
  };
  return (
    <section aria-label={copy.messenger.aiLabel} data-testid="genesis-support-messenger-ai" className="flex flex-col gap-2 rounded-md border p-3">
      {state.phase === "answered" ? (
        <>
          <p className="text-xs font-medium text-muted-foreground">{copy.messenger.aiLabel}</p>
          <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{state.answer}</p>
          <p className="text-xs text-muted-foreground">{copy.messenger.aiNote}</p>
          <CitedArticles ids={state.articleIds} titles={titles} copy={copy} go={go} here={here} />
        </>
      ) : (
        <p role="status" className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
          {state.safety ? (state.response ?? copy.messenger.aiSafety) : state.needsConsent ? copy.messenger.aiNeedsConsent : copy.messenger.aiNoAnswer}
        </p>
      )}
      {state.phase === "answered" && state.helped ? (
        <p role="status" className="text-sm text-muted-foreground">
          {copy.messenger.aiThanks}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {state.phase === "answered" ? (
            <Button size="sm" variant="secondary" onClick={() => void ask.helped()} data-testid="genesis-support-messenger-ai-helped">
              {copy.messenger.aiHelped}
            </Button>
          ) : null}
          {state.phase === "none" && state.needsConsent && onConsent ? (
            <Button size="sm" variant="secondary" onClick={onConsent} data-testid="genesis-support-messenger-ai-consent">
              {copy.messenger.aiConsent}
            </Button>
          ) : null}
          <Button size="sm" variant={state.phase === "answered" ? "outline" : "default"} disabled={handing} onClick={person} data-testid="genesis-support-messenger-ai-person">
            {copy.messenger.aiPerson}
          </Button>
        </div>
      )}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {copy.messenger.aiFailed}
        </p>
      ) : null}
    </section>
  );
}

function CitedArticles({ ids, copy, go, here, titles }: { ids: readonly string[]; titles: ReadonlyMap<string, { slug: string; title: string }> } & Pick<Shared, "copy" | "go" | "here">) {
  return ids.length ? (
    <nav aria-label={copy.messenger.aiSources} className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{copy.messenger.aiSources}</span>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => go({ name: "article", slug: titles.get(id)?.slug ?? id, from: here })}
          className="min-h-11 text-left text-primary underline underline-offset-2"
          data-testid={`genesis-support-messenger-ai-source-${id}`}
        >
          {titles.get(id)?.title ?? copy.messenger.aiSources}
        </button>
      ))}
    </nav>
  ) : null;
}

function Help({
  client,
  tenantId,
  copy,
  go,
  here,
  report,
  query,
  onSearch,
  ask,
  aiOn,
  onConsent,
}: Shared & { query: string; onSearch: (query: string) => void; ask: UseHelpAsk; aiOn: boolean; onConsent: (() => void) | undefined }) {
  const collections = useQuery({ queryKey: supportMessengerKeys.collections(tenantId ?? null), queryFn: () => required(client.helpCollections)(tenantId === undefined ? {} : { tenantId }) });
  const articles = useQuery({ queryKey: supportMessengerKeys.articles(tenantId ?? null, null), queryFn: () => required(client.helpArticles)(tenantId === undefined ? {} : { tenantId }) });
  const hits = useQuery({ queryKey: supportMessengerKeys.search(tenantId ?? null, query), queryFn: () => required(client.searchHelp)(query, tenantId === undefined ? {} : { tenantId }), enabled: Boolean(query) });
  useReported(collections.error, report);
  useReported(articles.error, report);
  useReported(hits.error, report);
  // What a citation names, by id, from the list this screen already read.
  const titles = useMemo(() => new Map((articles.data ?? []).map((a) => [a.id, { slug: a.slug, title: a.title }])), [articles.data]);
  const open = useCallback((slug: string) => go({ name: "article", slug, from: here }), [go, here]);
  const known = new Set((collections.data ?? []).map((c) => c.id));
  const loose = (articles.data ?? []).filter((a) => !a.collectionId || !known.has(a.collectionId));
  const items: InboxItem[] = [
    ...(collections.data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      ...(c.description ? { preview: c.description } : {}),
      onPress: () => go({ name: "collection", id: c.id, title: c.title, from: here }),
    })),
    ...articleItems(loose, open),
  ];
  return (
    <div data-testid="genesis-support-messenger-help" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 p-3">
        <SearchForm copy={copy} initial={query} onSearch={onSearch} />
        {aiOn ? <AnswerCard ask={ask} query={query} titles={titles} onConsent={onConsent} copy={copy} go={go} here={here} report={report} /> : null}
      </div>
      {query ? (
        <InboxPage
          testID="genesis-support-messenger-results"
          items={articleItems(hits.data ?? [], open)}
          loading={hits.isPending}
          error={hits.isError}
          errorTitle={copy.messenger.helpErrorTitle}
          errorBody={copy.messenger.errorBody}
          emptyTitle={copy.messenger.noResultsTitle}
          emptyBody={copy.messenger.noResultsBody}
          emptyActionLabel={copy.messenger.newMessage}
          onEmptyAction={() => go({ name: "compose", from: here })}
          hasMore={false}
          label={copy.messenger.spaces.help}
        />
      ) : (
        <InboxPage
          testID="genesis-support-messenger-browse"
          items={items}
          loading={collections.isPending || articles.isPending}
          error={collections.isError || articles.isError}
          errorTitle={copy.messenger.helpErrorTitle}
          errorBody={copy.messenger.errorBody}
          emptyTitle={copy.messenger.helpEmptyTitle}
          emptyBody={copy.messenger.helpEmptyBody}
          emptyActionLabel={copy.messenger.newMessage}
          onEmptyAction={() => go({ name: "compose", from: here })}
          hasMore={false}
          label={copy.messenger.spaces.help}
        />
      )}
    </div>
  );
}

function Collection({ client, tenantId, copy, go, here, report, id }: Shared & { id: string }) {
  const articles = useQuery({ queryKey: supportMessengerKeys.articles(tenantId ?? null, id), queryFn: () => required(client.helpArticles)({ ...(tenantId === undefined ? {} : { tenantId }), collectionId: id }) });
  useReported(articles.error, report);
  return (
    <InboxPage
      testID="genesis-support-messenger-collection"
      items={articleItems(articles.data ?? [], (slug) => go({ name: "article", slug, from: here }))}
      loading={articles.isPending}
      error={articles.isError}
      errorTitle={copy.messenger.helpErrorTitle}
      errorBody={copy.messenger.errorBody}
      emptyTitle={copy.messenger.helpEmptyTitle}
      emptyBody={copy.messenger.helpEmptyBody}
      hasMore={false}
      label={copy.messenger.spaces.help}
    />
  );
}

function Article({ client, tenantId, copy, go, here, report, slug }: Shared & { slug: string }) {
  const article = useQuery({ queryKey: supportMessengerKeys.article(tenantId ?? null, slug), queryFn: () => required(client.helpArticle)(slug, tenantId === undefined ? {} : { tenantId }) });
  useReported(article.error, report);
  if (article.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true" data-testid="genesis-support-messenger-article-loading">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!article.data) {
    return (
      <div data-testid="genesis-support-messenger-article-missing">
        <EmptyState title={article.isError ? copy.messenger.helpErrorTitle : copy.messenger.articleNotFound} {...(article.isError ? { description: copy.messenger.errorBody } : {})} />
      </div>
    );
  }
  const paragraphs = article.data.body.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <article data-testid="genesis-support-messenger-article" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{article.data.title}</h2>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
          {p.trim()}
        </p>
      ))}
      <div className="mt-2 flex flex-col gap-2 border-t pt-3">
        <p className="text-sm text-muted-foreground">{copy.messenger.stillNeedHelp}</p>
        <Button variant="outline" onClick={() => go({ name: "compose", from: here })} data-testid="genesis-support-messenger-article-new">
          {copy.messenger.newMessage}
        </Button>
      </div>
    </article>
  );
}

function Compose({ client, tenantId, copy, go, report, context, from }: Shared & { context: () => FeedbackContext; from: Screen }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = (e: FormEvent) => {
    e.preventDefault();
    const words = message.trim();
    if (!words || sending) return;
    setSending(true);
    setFailed(false);
    client
      .submit({ type: "question", message: words, context: context(), ...(tenantId === undefined ? {} : { tenantId }) })
      .then(({ id: ticket }) => {
        void queryClient.invalidateQueries({ queryKey: supportMessengerKeys.tickets(tenantId ?? null) });
        // Back from the thread goes where they started, not to this form.
        go({ name: "ticket", id: ticket, from });
      })
      .catch((error: unknown) => {
        setFailed(true);
        report(error);
      })
      .finally(() => setSending(false));
  };
  return (
    <form onSubmit={send} data-testid="genesis-support-messenger-compose" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <h2 className="text-lg font-semibold">{copy.messenger.composeTitle}</h2>
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={id}>{copy.messenger.composeLabel}</Label>
        <Textarea id={id} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={copy.messenger.composePlaceholder} rows={6} maxLength={10000} data-testid="genesis-support-messenger-compose-input" />
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {copy.messenger.composeFailed}
        </p>
      ) : null}
      <Button type="submit" disabled={sending || !message.trim()} data-testid="genesis-support-messenger-compose-send">
        {sending ? copy.feedback.sending : copy.feedback.send}
      </Button>
    </form>
  );
}

const threadSlots = { attachment: ThreadFileAttachment };

/** A person's conversation. Keyed by ticket, so a draft never follows them to another one. */
function Conversation({ client, tenantId, copy, report, id, resolveUser, active }: Shared & { id: string; resolveUser: ResolveUser | undefined; active: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const ticket = useQuery({ queryKey: supportMessengerKeys.ticket(id), queryFn: () => client.report(id) });
  const where = useQuery({ queryKey: ["genesis-support", "thread", id], queryFn: () => client.thread(id), staleTime: Infinity });
  const live = where.data?.mode === "chat";
  const replies = useQuery({ queryKey: supportMessengerKeys.replies(id), queryFn: () => client.replies(id), refetchInterval: where.data && !live ? 30_000 : false });
  useReported(ticket.error, report);
  useReported(replies.error, report);
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: supportMessengerKeys.replies(id) });
    void queryClient.invalidateQueries({ queryKey: supportMessengerKeys.ticket(id) });
    void queryClient.invalidateQueries({ queryKey: supportMessengerKeys.tickets(tenantId ?? null) });
  }, [queryClient, id, tenantId]);
  useEffect(() => client.subscribe(id, refresh), [client, id, refresh]);

  // Read while it's in front of them: as it shows, as something new arrives, and on coming back.
  const latest = replies.isFetchedAfterMount && !replies.isError && replies.data ? (replies.data[replies.data.length - 1]?.id ?? "none") : null;
  useEffect(() => {
    if (latest === null || !active) return;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      client
        .markRead(id)
        .then(() => queryClient.invalidateQueries({ queryKey: supportMessengerKeys.tickets(tenantId ?? null) }))
        .catch((error: unknown) => report(error));
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [client, id, latest, active, tenantId, queryClient, report]);

  const shown = useMemo(() => (replies.data ?? []).filter((r) => !r.internal), [replies.data]);
  const files = useMemo(() => threadFiles(shown, copy), [shown, copy]);
  const t = ticket.data;
  const messages = useMemo<ThreadMessage[]>(() => {
    if (!t) return [];
    return [
      // The ticket's own words come first: they aren't a message in its conversation.
      { id: t.id, body: t.message, mine: true, timestamp: t.createdAt },
      ...shown.map((r): ThreadMessage => {
        const attachments = threadAttachments(r, copy);
        const name = r.mine ? undefined : resolveUser && r.authorId ? resolveUser(r.authorId).name : copy.thread.support;
        return { id: r.id, body: r.body, mine: r.mine, ...(name ? { authorName: name } : {}), timestamp: r.createdAt, ...(attachments.length ? { attachments } : {}) };
      }),
      ...(replies.isError && !replies.data ? [{ id: "thread-failed", kind: "event" as const, body: copy.agentInbox.threadErrorTitle, mine: false, timestamp: t.createdAt }] : []),
    ];
  }, [t, shown, replies.isError, replies.data, resolveUser, copy]);

  if (ticket.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true" data-testid="genesis-support-messenger-thread-loading">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!t) {
    return (
      <div data-testid="genesis-support-messenger-thread-missing">
        <EmptyState title={ticket.isError ? copy.messenger.messagesErrorTitle : copy.thread.notFound} />
      </div>
    );
  }
  const send = () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setFailed(false);
    client
      .reply(id, body)
      .then(() => {
        setDraft("");
        refresh();
      })
      .catch((error: unknown) => {
        setFailed(true);
        report(error);
      })
      .finally(() => setSending(false));
  };
  return (
    <ThreadFilesContext.Provider value={files}>
      <ThreadPage
        conversationId={id}
        testID="genesis-support-messenger-thread"
        messages={messages}
        loading={replies.isPending}
        readAt={t.staffReadAt}
        readLabel={copy.thread.read}
        labels={{ you: copy.thread.you }}
        slots={threadSlots}
        {...(CLOSED.has(t.status) ? { closedNotice: copy.thread.closed } : {})}
        composer={
          CLOSED.has(t.status) || (replies.isError && !replies.data)
            ? null
            : {
                value: draft,
                onChangeText: setDraft,
                onSend: send,
                sending,
                placeholder: copy.thread.placeholder,
                sendLabel: copy.thread.send,
                sendingLabel: copy.thread.sending,
                maxLength: 10000,
                ...(failed
                  ? {
                      above: (
                        <p role="alert" className="px-3 pt-2 text-sm text-destructive">
                          {copy.messenger.composeFailed}
                        </p>
                      ),
                    }
                  : {}),
              }
        }
      />
    </ThreadFilesContext.Provider>
  );
}

function useReported(error: unknown, report: (error: unknown) => void) {
  useEffect(() => {
    if (error) report(error);
  }, [error, report]);
}

/** The messenger: Home, Messages and Help, in whatever holds it. Another tenant is another messenger: nothing carries over. */
export function SupportMessenger(props: SupportMessengerProps) {
  return <Messenger key={props.tenantId ?? ""} {...props} />;
}

function Messenger({ client, tenantId, spaces = SPACES, greeting, askAi, onAiConsent, active = true, resolveUser, context = defaultContext, copy: copyOverrides, onError, className }: SupportMessengerProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const first = spaces[0] ?? "home";
  const [screen, setScreen] = useState<Screen>({ name: "space", space: first });
  const [query, setQuery] = useState("");
  const errors = useRef(onError);
  errors.current = onError;
  const report = useCallback((error: unknown) => errors.current?.(error), []);
  const ai = useQuery({
    queryKey: supportMessengerKeys.ai(tenantId ?? null),
    queryFn: () => required(client.helpAiEnabled)(tenantId === undefined ? {} : { tenantId }),
    enabled: Boolean(askAi && spaces.includes("help")),
    staleTime: 5 * 60_000,
  });
  useReported(ai.error, report);
  const ask = useHelpAsk({ client, tenantId, askAi, context, onError: report });
  const aiOn = Boolean(askAi && ai.data);
  const shared: Shared = { client, tenantId, copy, go: setScreen, here: screen, report };

  const search = (next: string) => {
    setQuery(next);
    setScreen({ name: "space", space: "help" });
    ask.reset();
  };

  let body: ReactNode;
  switch (screen.name) {
    case "space":
      body =
        screen.space === "home" ? (
          <Home {...shared} greeting={greeting} onSearch={spaces.includes("help") ? search : null} />
        ) : screen.space === "messages" ? (
          <Messages {...shared} />
        ) : (
          <Help {...shared} query={query} onSearch={search} ask={ask} aiOn={aiOn} onConsent={onAiConsent} />
        );
      break;
    case "compose":
      body = <Compose {...shared} context={context} from={screen.from} />;
      break;
    case "ticket":
      body = <Conversation key={screen.id} {...shared} id={screen.id} resolveUser={resolveUser} active={active} />;
      break;
    case "collection":
      body = <Collection {...shared} id={screen.id} />;
      break;
    case "article":
      body = <Article {...shared} slug={screen.slug} />;
      break;
  }

  return (
    <div data-testid="genesis-support-messenger" className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      {screen.name !== "space" ? (
        <div className="flex items-center gap-2 border-b p-1">
          <Button variant="ghost" size="sm" className="h-11" onClick={() => setScreen(screen.from)} data-testid="genesis-support-messenger-back">
            <ChevronLeft className="size-4" aria-hidden />
            {copy.messenger.back}
          </Button>
          {screen.name === "collection" ? <h2 className="truncate text-sm font-semibold">{screen.title}</h2> : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      {screen.name === "space" && spaces.length > 1 ? (
        <nav aria-label={copy.messenger.spacesLabel} className="flex shrink-0 border-t">
          {spaces.map((s) => (
            <button
              key={s}
              type="button"
              aria-current={screen.space === s ? "page" : undefined}
              onClick={() => setScreen({ name: "space", space: s })}
              data-testid={`genesis-support-messenger-space-${s}`}
              className={cn(
                "min-h-11 flex-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                screen.space === s ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {copy.messenger.spaces[s]}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export interface SupportMessengerLauncherProps extends Omit<SupportMessengerProps, "active"> {
  /** Floating in a corner, or `inline`, where you put it (your nav, a help menu). In an app with a chat dock, whose windows sit bottom-right, use `bottom-left` or `inline`. */
  position?: "bottom-right" | "bottom-left" | "inline";
  /** The button's words. Default the copy's "Help". */
  label?: string;
  /** Opens the app's own help page from the dock's expand button. */
  onExpand?: () => void;
  /** How often the unread count re-reads, in ms. Default a minute; `false` for never. */
  refreshInterval?: number | false;
}

const PANEL_ID = "genesis-support-messenger";
const POSITIONS = { "bottom-right": "fixed bottom-4 right-4 z-50", "bottom-left": "fixed bottom-4 left-4 z-50", inline: "" } as const;

/** A button with the unread count that opens the messenger: in the chat dock when there is one, else a sheet. */
export function SupportMessengerLauncher({ position = "bottom-right", label, onExpand, refreshInterval = 60_000, ...messenger }: SupportMessengerLauncherProps) {
  const { client, tenantId } = messenger;
  const copy = useMemo(() => resolveSupportCopy(messenger.copy), [messenger.copy]);
  const dock = useOptionalChatDock();
  const [sheet, setSheet] = useState(false);
  const tickets = useQuery({ queryKey: supportMessengerKeys.tickets(tenantId ?? null), queryFn: () => required(client.ticketsInTenant)(tenantId === undefined ? {} : { tenantId }), refetchInterval: refreshInterval });
  const unread = (tickets.data ?? []).filter((t) => t.unread).length;
  const title = label ?? copy.messenger.title;

  // The dock holds the panel's `render` as it was: one stable function, reading the latest props.
  const latest = useRef(messenger);
  latest.current = messenger;
  // A new function when the tenant changes, so the dock draws the new one; `state` is absent on a dock from before it passed one.
  const render = useCallback((state?: { visible: boolean }) => <SupportMessenger {...latest.current} tenantId={tenantId} active={state?.visible ?? true} />, [tenantId]);
  const updatePanel = dock?.updatePanel;
  useEffect(() => {
    updatePanel?.(PANEL_ID, { unread, render });
  }, [updatePanel, unread, render]);

  // In the dock, its own bar is the way back to it.
  if (dock?.items.some((item) => item.id === PANEL_ID)) return null;

  const open = () => {
    if (dock) dock.openPanel({ id: PANEL_ID, title, render, unread, icon: <MessageCircle className="size-4" aria-hidden />, ...(onExpand ? { onExpand } : {}) });
    else setSheet(true);
  };
  return (
    <>
      <Button
        className={POSITIONS[position]}
        onClick={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? fill(copy.messenger.openWithUnread, { count: unread }) : title}
        data-testid="genesis-support-messenger-launcher"
      >
        <MessageCircle className="size-4" aria-hidden />
        {title}
        {unread > 0 ? (
          <span aria-hidden data-testid="genesis-support-messenger-unread" className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1 text-xs font-semibold text-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>
      {dock ? null : (
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md" data-testid="genesis-support-messenger-sheet">
            <SheetTitle className="sr-only">{title}</SheetTitle>
            <SheetDescription className="sr-only">{copy.messenger.greeting}</SheetDescription>
            <SupportMessenger {...messenger} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
