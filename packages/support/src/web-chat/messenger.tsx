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
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, House, MessageCircle } from "lucide-react";
import {
  Button,
  EmptyState,
  InboxPage,
  InlineAlert,
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
  toast,
  type InboxItem,
  type ThreadMessage,
} from "@marktiderman/genesis-ui";
import { TabBar } from "@marktiderman/genesis-ui/layout";
import { useOptionalChatDock, type ResolveUser } from "@marktiderman/genesis-chat/web";
import { asksVerification, reportHeading, SupportError, type HelpArticleSummary, type HelpSearchHit, type SupportClient, type Ticket } from "../client";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { useHelpAsk, type HelpAnswerResponse, type UseHelpAsk } from "../help-ask";
import type { OfficeHours } from "../office-hours";
import { awaitingReplyLine, composeExpectationLine, useReplyExpectation, type ReplyExpectation } from "../reply-expectation";
import type { FeedbackContext } from "../record";
import { deskName } from "./desks";
import { scopeOf, useLoginScope, useResolvedTenant } from "./tenant";
import { SupportContact } from "./contact";
import { supportContact, supportSettingValues, type SupportContactInfo, type SupportSettingsInput } from "../settings";
import { threadAttachments } from "./thread-files";

export type MessengerSpace = "home" | "messages" | "help";

export const supportMessengerKeys = {
  all: ["genesis-support", "messenger"] as const,
  tickets: (scope: string) => ["genesis-support", "messenger", "tickets", scope] as const,
  ticket: (id: string) => ["genesis-support", "messenger", "ticket", id] as const,
  replies: (id: string) => ["genesis-support", "messenger", "replies", id] as const,
  collections: (scope: string) => ["genesis-support", "messenger", "collections", scope] as const,
  articles: (scope: string, collectionId: string | null) => ["genesis-support", "messenger", "articles", scope, collectionId] as const,
  article: (scope: string, slug: string) => ["genesis-support", "messenger", "article", scope, slug] as const,
  search: (scope: string, query: string) => ["genesis-support", "messenger", "search", scope, query] as const,
  ai: (scope: string) => ["genesis-support", "messenger", "ai", scope] as const,
  desks: (loginScope: string) => ["genesis-support", "messenger", "desks", loginScope] as const,
};

export interface SupportMessengerProps {
  /** A support client, made with the `chat` option for live threads. */
  client: SupportClient;
  /** Whose help desk: the viewer's current workspace. Null is the app's own. Left out, the client's `tenantId`, else the app's own. */
  tenantId?: string | null;
  /**
   * Messages (and the unread badge) list the person's conversations at every desk, not only this
   * tenant's: someone who belongs to several tenants (desks, migration 0024) sees each answer in one
   * place. A new conversation still goes to `tenantId` (or, with none, where the database routes it).
   * Default false.
   */
  allTenants?: boolean;
  /**
   * Genesis settings (what `resolveSettings` returned, or the values alone): `support.messenger` off
   * shows nothing (the launcher too), `support.helpCenter` off leaves Help out, and
   * `support.contactEmail` / `support.contactUrl` show under Help and on error screens. Left out,
   * the `max` preset (everything on, no contact).
   */
  settings?: SupportSettingsInput | null;
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
  /**
   * How soon people hear back, in your words, after "We usually reply" ("within a few hours",
   * "in under a day"). Shown on the compose screen and under a conversation nobody has answered.
   */
  replyExpectation?: string;
  /** When someone answers. Outside them, the messenger says you're away and when you're back, in the person's own time. */
  officeHours?: OfficeHours;
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
  tenantId: string | null;
  scope: string;
  /** The contact fallback, or null. */
  contact: SupportContactInfo | null;
  /** The person's tickets as the messenger lists them: this tenant's, or every tenant's (`allTenants`). */
  tickets: { queryKey: readonly unknown[]; queryFn: () => Promise<Ticket[]> };
  copy: SupportCopy;
  go: (screen: Screen) => void;
  here: Screen;
  report: (error: unknown) => void;
  expectation: ReplyExpectation;
  /** `support.verifyPrompt`: a fixed conversation asks "Is it fixed?". */
  verifyPrompt: boolean;
  /** A ticket's desk name, when Messages lists every desk's. */
  deskOf: (t: Ticket) => string | null;
}

function ticketItems(tickets: readonly Ticket[], copy: SupportCopy, open: (id: string) => void, deskOf: (t: Ticket) => string | null = () => null): InboxItem[] {
  return tickets.map((t) => {
    const desk = deskOf(t);
    return {
      id: t.id,
      title: reportHeading(t),
      timestamp: t.lastStaffReplyAt ?? t.createdAt,
      unread: t.unread,
      meta: desk ? fill(copy.messenger.rowAtDesk, { status: copy.status[t.status], desk }) : copy.status[t.status],
      onPress: () => open(t.id),
    };
  });
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

function Home({ client, tenantId, scope, tickets: ticketsQuery, copy, go, here, report, deskOf, greeting, onSearch, help }: Shared & { greeting: string | undefined; onSearch: ((query: string) => void) | null; help: boolean }) {
  const tickets = useQuery(ticketsQuery);
  // support.helpCenter off: no articles on Home either.
  const articles = useQuery({ queryKey: supportMessengerKeys.articles(scope, null), queryFn: () => required(client.helpArticles)({ tenantId }), enabled: help });
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
          items={ticketItems([latest], copy, (id) => go({ name: "ticket", id, from: here }), deskOf)}
        />
      ) : null}
      {help && articles.data?.length ? (
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

function Messages({ tickets: ticketsQuery, copy, go, here, report, deskOf }: Shared) {
  const tickets = useQuery(ticketsQuery);
  useReported(tickets.error, report);
  const items = useMemo(() => ticketItems(tickets.data ?? [], copy, (id) => go({ name: "ticket", id, from: here }), deskOf), [tickets.data, copy, go, here, deskOf]);
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
          {state.phase === "none" && state.needsConsent ? (
            <Button size="sm" variant="outline" onClick={() => void ask.ask(state.question)} data-testid="genesis-support-messenger-ai-retry">
              {copy.messenger.aiRetry}
            </Button>
          ) : null}
          <Button size="sm" variant={state.phase === "answered" ? "outline" : "default"} disabled={handing} onClick={person} data-testid="genesis-support-messenger-ai-person">
            {copy.messenger.aiPerson}
          </Button>
        </div>
      )}
      {failed ? <InlineAlert variant="destructive" description={copy.messenger.aiFailed} testID="genesis-support-messenger-ai-failed" /> : null}
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
          className="min-h-11 text-left text-primary-text underline underline-offset-2"
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
  scope,
  contact,
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
  const collections = useQuery({ queryKey: supportMessengerKeys.collections(scope), queryFn: () => required(client.helpCollections)({ tenantId }) });
  const articles = useQuery({ queryKey: supportMessengerKeys.articles(scope, null), queryFn: () => required(client.helpArticles)({ tenantId }) });
  const hits = useQuery({ queryKey: supportMessengerKeys.search(scope, query), queryFn: () => required(client.searchHelp)(query, { tenantId }), enabled: Boolean(query) });
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
      <SupportContact contact={contact} copy={copy} />
    </div>
  );
}

function Collection({ client, tenantId, scope, copy, go, here, report, id }: Shared & { id: string }) {
  const articles = useQuery({ queryKey: supportMessengerKeys.articles(scope, id), queryFn: () => required(client.helpArticles)({ tenantId, collectionId: id }) });
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

function Article({ client, tenantId, scope, contact, copy, go, here, report, slug }: Shared & { slug: string }) {
  const article = useQuery({ queryKey: supportMessengerKeys.article(scope, slug), queryFn: () => required(client.helpArticle)(slug, { tenantId }) });
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
        <EmptyState
          title={article.isError ? copy.messenger.helpErrorTitle : copy.messenger.articleNotFound}
          {...(article.isError ? { description: copy.messenger.errorBody } : {})}
          action={<SupportContact contact={contact} bare copy={copy} />}
        />
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

function Compose({ client, tenantId, scope, tickets, copy, go, report, expectation, context, from }: Shared & { context: () => FeedbackContext; from: Screen }) {
  const id = useId();
  const line = composeExpectationLine(expectation, copy);
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
      .submit({ type: "question", message: words, context: context(), tenantId })
      .then(({ id: ticket }) => {
        void queryClient.invalidateQueries({ queryKey: tickets.queryKey });
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
      {line ? (
        <p data-testid="genesis-support-messenger-expectation" className="text-sm text-muted-foreground">
          {line}
        </p>
      ) : null}
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={id}>{copy.messenger.composeLabel}</Label>
        <Textarea id={id} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={copy.messenger.composePlaceholder} rows={6} maxLength={10000} data-testid="genesis-support-messenger-compose-input" />
      </div>
      {failed ? <InlineAlert variant="destructive" description={copy.messenger.composeFailed} testID="genesis-support-messenger-compose-failed" /> : null}
      <Button type="submit" disabled={sending || !message.trim()} data-testid="genesis-support-messenger-compose-send">
        {sending ? copy.feedback.sending : copy.feedback.send}
      </Button>
    </form>
  );
}

/** A person's conversation. Keyed by ticket, so a draft never follows them to another one. */
function Conversation({ client, tenantId, scope, contact, tickets, copy, report, expectation, verifyPrompt, id, resolveUser, active }: Shared & { id: string; resolveUser: ResolveUser | undefined; active: boolean }) {
  const queryClient = useQueryClient();
  const frame = useRef<HTMLDivElement>(null);
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
    void queryClient.invalidateQueries({ queryKey: tickets.queryKey });
    // The list it refreshes is the one shown now (`allTenants` can change it).
  }, [queryClient, id, scope, JSON.stringify(tickets.queryKey)]);
  useEffect(() => client.subscribe(id, refresh), [client, id, refresh]);

  // Read while it's in front of them: as it shows, as something new arrives, and on coming back.
  const latest = replies.isFetchedAfterMount && !replies.isError && replies.data ? (replies.data[replies.data.length - 1]?.id ?? "none") : null;
  useEffect(() => {
    if (latest === null || !active) return;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      client
        .markRead(id)
        .then(() => queryClient.invalidateQueries({ queryKey: tickets.queryKey }))
        .catch((error: unknown) => report(error));
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [client, id, latest, active, scope, queryClient, report, JSON.stringify(tickets.queryKey)]);

  const shown = useMemo(() => (replies.data ?? []).filter((r) => !r.internal), [replies.data]);
  const threadFailed = replies.isError && !replies.data;
  const t = ticket.data;
  const messages = useMemo<ThreadMessage[]>(() => {
    if (!t || threadFailed) return [];
    return [
      // The ticket's own words come first: they aren't a message in its conversation.
      { id: t.id, body: t.message, mine: true, timestamp: t.createdAt },
      ...shown.map((r): ThreadMessage => {
        const attachments = threadAttachments(r, copy);
        const name = r.mine ? undefined : resolveUser && r.authorId ? resolveUser(r.authorId).name : copy.thread.support;
        return { id: r.id, body: r.body, mine: r.mine, ...(name ? { authorName: name } : {}), timestamp: r.createdAt, ...(attachments.length ? { attachments } : {}) };
      }),
    ];
  }, [t, threadFailed, shown, resolveUser, copy]);

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
        <EmptyState title={ticket.isError ? copy.messenger.messagesErrorTitle : copy.thread.notFound} action={ticket.isError ? <SupportContact contact={contact} bare copy={copy} /> : undefined} />
      </div>
    );
  }
  // Until support first answers, say where the answer will come.
  const awaiting = replies.isSuccess && !shown.some((r) => r.fromStaff);
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
  const thread = (
    <ThreadPage
        conversationId={id}
        testID="genesis-support-messenger-thread"
        messages={messages}
        loading={replies.isPending}
        readAt={t.staffReadAt}
        readLabel={copy.thread.read}
        labels={{ you: copy.thread.you }}
        error={threadFailed}
        errorTitle={copy.agentInbox.threadErrorTitle}
        errorBody={copy.messenger.errorBody}
        onRetry={() => void replies.refetch()}
        retryLabel={copy.agentInbox.retry}
        {...(CLOSED.has(t.status) ? { closedNotice: copy.thread.closed } : {})}
        composer={
          CLOSED.has(t.status) || threadFailed
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
                      above: <InlineAlert variant="destructive" className="mx-3 mt-2" description={copy.messenger.composeFailed} testID="genesis-support-messenger-reply-failed" />,
                    }
                  : awaiting
                    ? {
                        above: (
                          <p data-testid="genesis-support-messenger-awaiting" className="px-3 pt-2 text-sm text-muted-foreground">
                            {awaitingReplyLine(expectation, copy)}
                          </p>
                        ),
                      }
                    : {}),
              }
        }
      />
  );
  // Marked fixed: the person answers "Is it fixed?" here (the `support.verify` notification lands on this thread).
  const verify = client.verify?.bind(client);
  return (
    <div ref={frame} tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus-visible:outline-none" data-testid="genesis-support-messenger-conversation">
      {verify && asksVerification(t, verifyPrompt) ? (
        <VerifyCard
          verify={verify}
          ticketId={id}
          copy={copy}
          report={report}
          onDone={() => {
            refresh();
            // The card goes once it's answered: focus stays in the conversation.
            frame.current?.focus();
          }}
        />
      ) : null}
      {thread}
    </div>
  );
}

/** "Is it fixed?": confirm the fix, or reopen it with what's still wrong (`client.verify`). */
function VerifyCard({
  verify,
  ticketId,
  copy,
  report,
  onDone,
}: {
  verify: NonNullable<SupportClient["verify"]>;
  ticketId: string;
  copy: SupportCopy;
  report: (error: unknown) => void;
  onDone: () => void;
}) {
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const [reopening, setReopening] = useState(false);
  // Reopen moves to the note; Cancel back to Reopen.
  const opened = useRef(false);
  useEffect(() => {
    if (reopening) noteRef.current?.focus();
    else if (opened.current) reopenRef.current?.focus();
    opened.current = reopening;
  }, [reopening]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // One answer: a second press while one is sent, or after it was taken, sends nothing.
  const sending = useRef(false);
  const [answered, setAnswered] = useState(false);
  const answer = (fixed: boolean) => {
    if (sending.current || answered) return;
    sending.current = true;
    setBusy(true);
    setFailed(false);
    verify(ticketId, fixed, fixed ? undefined : note.trim() || undefined)
      .then(() => {
        setAnswered(true);
        toast.success(fixed ? copy.messenger.verifyThanks : copy.messenger.verifyReopened);
        onDone();
      })
      .catch((error: unknown) => {
        setFailed(true);
        report(error);
      })
      .finally(() => {
        sending.current = false;
        setBusy(false);
      });
  };
  // Answered: the card goes while the thread reads the ticket again.
  if (answered) return null;
  return (
    <div className="flex flex-col gap-2 p-3">
      <InlineAlert
        title={copy.messenger.verifyTitle}
        description={copy.messenger.verifyBody}
        testID="genesis-support-messenger-verify"
        actions={
          reopening ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => answer(false)} data-testid="genesis-support-messenger-verify-reopen-send">
                {copy.messenger.verifySend}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setReopening(false)} data-testid="genesis-support-messenger-verify-cancel">
                {copy.messenger.verifyCancel}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={() => answer(true)} data-testid="genesis-support-messenger-verify-fixed">
                {copy.messenger.verifyFixed}
              </Button>
              <Button ref={reopenRef} size="sm" variant="outline" disabled={busy} onClick={() => setReopening(true)} data-testid="genesis-support-messenger-verify-reopen">
                {copy.messenger.verifyReopen}
              </Button>
            </>
          )
        }
      >
        {reopening ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={noteId}>{copy.messenger.verifyNoteLabel}</Label>
            <Textarea ref={noteRef} id={noteId} value={note} rows={3} maxLength={10000} onChange={(e) => setNote(e.target.value)} data-testid="genesis-support-messenger-verify-note" />
          </div>
        ) : null}
      </InlineAlert>
      {failed ? <InlineAlert variant="destructive" description={copy.messenger.verifyFailed} testID="genesis-support-messenger-verify-failed" /> : null}
    </div>
  );
}

function useReported(error: unknown, report: (error: unknown) => void) {
  useEffect(() => {
    if (error) report(error);
  }, [error, report]);
}

/** The messenger: Home, Messages and Help, in whatever holds it. Another tenant is another messenger: nothing carries over. */
export function SupportMessenger(props: SupportMessengerProps) {
  const tenant = useResolvedTenant(props.client, props.tenantId);
  // support.messenger off: no messenger (after the hook, which always runs).
  if (!supportSettingValues(props.settings).support.messenger) return null;
  if (tenant.failed) {
    const copy = resolveSupportCopy(props.copy);
    return (
      <div data-testid="genesis-support-messenger-failed">
        <EmptyState
          title={copy.messenger.helpErrorTitle}
          description={copy.messenger.errorBody}
          action={<SupportContact contact={supportContact(props.settings)} bare {...(props.copy ? { copy: props.copy } : {})} />}
        />
      </div>
    );
  }
  if (!tenant.ready) return <Skeleton data-testid="genesis-support-messenger-loading" className="h-64 w-full" />;
  return <Messenger key={scopeOf(props.client, tenant.tenantId)} {...props} tenantId={tenant.tenantId} />;
}

/** The person's tickets as the messenger lists them: one tenant's, or (`allTenants`) every tenant's. */
function ticketsQueryOf(client: SupportClient, tenantId: string | null, allTenants: boolean) {
  const scope = scopeOf(client, tenantId);
  return allTenants
    ? { queryKey: supportMessengerKeys.tickets(`${scope}:all`), queryFn: () => client.myReports() }
    : { queryKey: supportMessengerKeys.tickets(scope), queryFn: () => required(client.ticketsInTenant)({ tenantId }) };
}

const SPACE_ICONS: Record<MessengerSpace, ReactNode> = { home: <House />, messages: <MessageCircle />, help: <BookOpen /> };

function Messenger({ client, tenantId: tenantProp, allTenants = false, settings, spaces: spacesProp = SPACES, greeting, askAi, onAiConsent, active = true, resolveUser, context = defaultContext, replyExpectation, officeHours, copy: copyOverrides, onError, className }: SupportMessengerProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const tenantId = tenantProp ?? null;
  const scope = scopeOf(client, tenantId);
  const values = supportSettingValues(settings);
  const spaces = values.support.helpCenter ? spacesProp : spacesProp.filter((sp) => sp !== "help");
  const contact = supportContact(settings);
  const first = spaces[0] ?? "home";
  const [screen, setScreen] = useState<Screen>({ name: "space", space: first });
  const [query, setQuery] = useState("");
  const errors = useRef(onError);
  errors.current = onError;
  const report = useCallback((error: unknown) => errors.current?.(error), []);
  const ai = useQuery({
    queryKey: supportMessengerKeys.ai(scope),
    queryFn: () => required(client.helpAiEnabled)({ tenantId }),
    enabled: Boolean(askAi && spaces.includes("help")),
    staleTime: 5 * 60_000,
  });
  useReported(ai.error, report);
  const ask = useHelpAsk({ client, tenantId, askAi, context, onError: report });
  const aiOn = Boolean(askAi && ai.data);
  const expectation = useReplyExpectation(replyExpectation, officeHours);
  const tickets = useMemo(() => ticketsQueryOf(client, tenantId, allTenants), [client, tenantId, allTenants]);
  // With every desk's conversations, each row names its desk (`myTicketDesks`): the app's label, else the copy's ("Support" for the app's own).
  const { scope: loginScope } = useLoginScope(client, null);
  const readDesks = client.myTicketDesks?.bind(client);
  const desks = useQuery({ queryKey: supportMessengerKeys.desks(loginScope ?? ""), queryFn: allTenants && readDesks && loginScope ? () => readDesks() : skipToken, staleTime: 60_000 });
  useReported(desks.error, report);
  const deskNames = useMemo(() => new Map((desks.data ?? []).map((d) => [d.ticketId, deskName(d, copy)])), [desks.data, copy]);
  const deskOf = useCallback((t: Ticket) => deskNames.get(t.id) ?? null, [deskNames]);
  const shared: Shared = { client, tenantId, scope, contact, tickets, copy, go: setScreen, here: screen, report, expectation, deskOf, verifyPrompt: values.support.verifyPrompt };
  const unread = useQuery({ ...tickets, enabled: spaces.includes("messages") }).data?.filter((t) => t.unread).length ?? 0;

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
          <Home {...shared} greeting={greeting} onSearch={spaces.includes("help") ? search : null} help={values.support.helpCenter} />
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
        <TabBar
          className="shrink-0"
          label={copy.messenger.spacesLabel}
          items={spaces.map((s) => ({ key: s, label: copy.messenger.spaces[s], icon: SPACE_ICONS[s], ...(s === "messages" && unread ? { badge: unread } : {}) }))}
          value={screen.space}
          onChange={(key) => {
            const space = spaces.find((s) => s === key);
            if (space) setScreen({ name: "space", space });
          }}
          testID="genesis-support-messenger-space"
        />
      ) : null}
    </div>
  );
}

export interface SupportMessengerLauncherProps extends Omit<SupportMessengerProps, "active"> {
  /** Floating in a corner, or `inline`, where you put it (your nav, a help menu). In an app with a chat dock, whose windows sit bottom-right, use `bottom-left` or `inline`. */
  position?: "bottom-right" | "bottom-left" | "inline";
  /** The button's words. Default the copy's "Help". */
  label?: string;
  /**
   * `button` (default): the icon and the words. `icon`: a ghost icon button named by the words, with
   * the unread count as a badge on its corner, for a header or a toolbar. On a phone with a bottom
   * tab bar, put an `icon` launcher (`position="inline"`) in the header rather than float one over
   * the page, where it covers the controls on the right (docs/RESPONSIVE.md, rule 9).
   */
  variant?: "button" | "icon";
  /** Opens the app's own help page from the dock's expand button. */
  onExpand?: () => void;
  /** How often the unread count re-reads, in ms. Default a minute; `false` for never. */
  refreshInterval?: number | false;
}

const PANEL_ID = "genesis-support-messenger";
const POSITIONS = { "bottom-right": "fixed bottom-4 right-4 z-50", "bottom-left": "fixed bottom-4 left-4 z-50", inline: "" } as const;

/** A button with the unread count that opens the messenger: in the chat dock when there is one, else a sheet. */
export function SupportMessengerLauncher({ position = "bottom-right", label, variant = "button", onExpand, refreshInterval = 60_000, ...messenger }: SupportMessengerLauncherProps) {
  const { client } = messenger;
  const { ready: resolved, tenantId } = useResolvedTenant(client, messenger.tenantId);
  const on = supportSettingValues(messenger.settings).support.messenger;
  const ready = resolved && on;
  const copy = useMemo(() => resolveSupportCopy(messenger.copy), [messenger.copy]);
  const dock = useOptionalChatDock();
  const [sheet, setSheet] = useState(false);
  const tickets = useQuery({ ...ticketsQueryOf(client, tenantId, messenger.allTenants ?? false), enabled: ready, refetchInterval: refreshInterval });
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

  // support.messenger off: no launcher.
  if (!on) return null;
  const open = () => {
    if (dock) dock.openPanel({ id: PANEL_ID, title, render, unread, icon: <MessageCircle className="size-4" aria-hidden />, ...(onExpand ? { onExpand } : {}) });
    else setSheet(true);
  };
  return (
    <>
      {variant === "icon" ? (
        <Button
          // Ghost in a header or toolbar; filled, round and raised when it floats over the page.
          variant={position === "inline" ? "ghost" : "default"}
          size="icon"
          className={cn("relative [&_svg]:size-5", position !== "inline" && "rounded-full shadow-lg", POSITIONS[position])}
          onClick={open}
          aria-haspopup="dialog"
          aria-label={unread > 0 ? fill(copy.messenger.openWithUnread, { count: unread }) : title}
          data-testid="genesis-support-messenger-launcher"
          data-variant="icon"
        >
          <MessageCircle aria-hidden />
          {unread > 0 ? (
            <span aria-hidden data-testid="genesis-support-messenger-unread" className={cn("absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold leading-none ring-2", position === "inline" ? "bg-primary text-primary-foreground ring-background" : "bg-background text-foreground ring-primary")}>
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      ) : (
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
      )}
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
