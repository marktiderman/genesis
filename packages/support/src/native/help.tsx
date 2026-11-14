/**
 * The messenger on the phone, as hooks that return a Genesis layout's props, like the rest of
 * support's screens. Messages and a conversation are `useSupportInbox` and `useSupportThread`.
 *
 *   const home = useMessengerHome();              → <InboxPage {...home} />
 *   const help = useHelpCenter({ collectionId, initialQuery }); → <InboxPage {...help} />
 *   const article = useHelpArticle(slug);         → <HelpArticleBody {...article} />
 *   const start = useStartConversation();         → <ThreadPage {...start} />
 *
 * Home and the help center open `paths.help` with `?q=` (a search) or `?collection=`: the route reads
 * them (`useLocalSearchParams`) and passes `initialQuery` and `collectionId`, and keys the screen on them.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NativeButton, NativeSearchBar, NativeText } from "@marktiderman/genesis-ui-native/components";
import type { InboxItem, InboxPageProps, ThreadPageProps } from "@marktiderman/genesis-ui-native/layouts";
import { reportHeading, SupportError, type HelpArticle } from "../client";
import type { SupportCopy } from "../copy";
import { useHelpAsk, type UseHelpAsk } from "../help-ask";
import { composeExpectationLine, useReplyExpectation } from "../reply-expectation";
import { SUPPORT_QUERY_ROOT, useSupport } from "./support";

const key = (...parts: (string | null)[]) => [SUPPORT_QUERY_ROOT, "help", ...parts];

function required<T>(method: T | undefined): NonNullable<T> {
  if (!method) throw new SupportError("This support client has no help center.", "0A000", "messenger");
  return method as NonNullable<T>;
}

function useTenant(): string | null {
  const { tenantId } = useSupport().options;
  return (typeof tenantId === "function" ? tenantId() : tenantId) ?? null;
}

export interface HelpAnswerCardProps {
  ask: UseHelpAsk;
  /** A cited article's title and slug, by id. */
  titles: ReadonlyMap<string, { slug: string; title: string }>;
  copy: SupportCopy;
  onArticle: (slug: string) => void;
  onTicket: (ticketId: string) => void;
  /** The person's words so far: an offer to ask, before anything goes to the AI. */
  query: string;
  onConsent?: (() => void) | undefined;
}

/** The AI's answer, or that it has none, always with the way to a person. */
export function HelpAnswerCard({ ask, titles, copy, onArticle, onTicket, query, onConsent }: HelpAnswerCardProps) {
  const { state } = ask;
  const [failed, setFailed] = useState(false);
  if (state.phase === "idle") {
    return query ? (
      <View style={{ gap: 4 }}>
        <NativeButton size="sm" variant="outline" onPress={() => void ask.ask(query)} testID="genesis-support-help-ai-ask">
          {copy.messenger.aiAsk}
        </NativeButton>
        <NativeText preset="caption" className="text-muted-foreground">
          {copy.messenger.aiAskHint}
        </NativeText>
      </View>
    ) : null;
  }
  if (state.phase === "asking") {
    return (
      <View accessibilityLiveRegion="polite" testID="genesis-support-help-ai-asking" style={{ padding: 16 }}>
        <NativeText preset="body-sm" className="text-muted-foreground">{copy.messenger.aiThinking}</NativeText>
      </View>
    );
  }
  const person = () => {
    setFailed(false);
    ask.toPerson().then(onTicket, () => setFailed(true));
  };
  return (
    <View testID="genesis-support-help-ai" style={{ gap: 8, padding: 16 }}>
      {state.phase === "answered" ? (
        <>
          <NativeText preset="caption">{copy.messenger.aiLabel}</NativeText>
          <NativeText>{state.answer}</NativeText>
          <NativeText preset="body-sm" className="text-muted-foreground">{copy.messenger.aiNote}</NativeText>
          {state.articleIds.map((id) => {
            const known = titles.get(id);
            return (
              <NativeButton key={id} size="sm" variant="ghost" onPress={() => onArticle(known?.slug ?? id)} testID={`genesis-support-help-ai-source-${id}`}>
                {known?.title ?? copy.messenger.aiSources}
              </NativeButton>
            );
          })}
        </>
      ) : (
        <NativeText accessibilityLiveRegion="polite">{state.safety ? (state.response ?? copy.messenger.aiSafety) : state.needsConsent ? copy.messenger.aiNeedsConsent : copy.messenger.aiNoAnswer}</NativeText>
      )}
      {state.phase === "answered" && state.helped ? (
        <NativeText preset="body-sm" className="text-muted-foreground">{copy.messenger.aiThanks}</NativeText>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {state.phase === "answered" ? (
            <NativeButton size="sm" variant="outline" onPress={() => void ask.helped()} testID="genesis-support-help-ai-helped">
              {copy.messenger.aiHelped}
            </NativeButton>
          ) : null}
          {state.phase === "none" && state.needsConsent && onConsent ? (
            <NativeButton size="sm" variant="outline" onPress={onConsent} testID="genesis-support-help-ai-consent">
              {copy.messenger.aiConsent}
            </NativeButton>
          ) : null}
          {state.phase === "none" && state.needsConsent ? (
            <NativeButton size="sm" variant="outline" onPress={() => void ask.ask(state.question)} testID="genesis-support-help-ai-retry">
              {copy.messenger.aiRetry}
            </NativeButton>
          ) : null}
          <NativeButton size="sm" onPress={person} testID="genesis-support-help-ai-person">
            {copy.messenger.aiPerson}
          </NativeButton>
        </View>
      )}
      {failed ? <NativeText accessibilityRole="alert">{copy.messenger.aiFailed}</NativeText> : null}
    </View>
  );
}

type ListProps = Pick<InboxPageProps, "items" | "header" | "refreshing" | "onRefresh" | "emptyTitle" | "emptyBody" | "emptyActionLabel" | "onEmptyAction" | "sectionTitle" | "testID" | "loading" | "error" | "errorTitle" | "errorBody"> & { headerTitle: string };

/** Home: a greeting, search, the way to send a message; the latest conversation and articles as rows. */
export function useMessengerHome(options: { greeting?: string } = {}): ListProps {
  const block = useSupport();
  const { copy, client, paths } = block;
  const navigate = block.options.navigate;
  const tenantId = useTenant();
  const [query, setQuery] = useState("");
  const tickets = useQuery({ queryKey: key("tickets", tenantId), queryFn: () => required(client.ticketsInTenant)({ tenantId }) });
  const articles = useQuery({ queryKey: key("articles", tenantId, null), queryFn: () => required(client.helpArticles)({ tenantId }) });
  const latest = tickets.data?.[0];
  const items: InboxItem[] = [
    ...(latest
      ? [
          {
            id: latest.id,
            title: reportHeading(latest),
            timestamp: latest.lastStaffReplyAt ?? latest.createdAt,
            unread: latest.unread,
            meta: copy.messenger.recent,
            onPress: () => navigate(paths.thread(latest.id)),
          },
        ]
      : []),
    ...(articles.data ?? []).slice(0, 5).map(
      (a): InboxItem => ({ id: a.id, title: a.title, ...(a.summary ? { preview: a.summary } : {}), onPress: () => navigate(paths.article(a.slug)) }),
    ),
  ];
  const header: ReactNode = (
    <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 12 }}>
      <NativeText preset="h2">{options.greeting ?? copy.messenger.greeting}</NativeText>
      <NativeSearchBar
        value={query}
        onChange={setQuery}
        placeholder={copy.messenger.searchPlaceholder}
        onSubmit={(value) => navigate(`${paths.help}?q=${encodeURIComponent(value.trim())}`)}
      />
      <NativeButton onPress={() => navigate(paths.newMessage)} testID="genesis-support-home-new">
        {copy.messenger.newMessage}
      </NativeButton>
    </View>
  );
  return {
    testID: "genesis-support-home",
    headerTitle: copy.messenger.title,
    header,
    items,
    loading: tickets.isPending && articles.isPending,
    error: tickets.isError && articles.isError,
    errorTitle: copy.messenger.helpErrorTitle,
    errorBody: copy.messenger.errorBody,
    emptyTitle: copy.messenger.helpEmptyTitle,
    emptyBody: copy.messenger.helpEmptyBody,
    refreshing: tickets.isRefetching || articles.isRefetching,
    onRefresh: async () => {
      await Promise.all([tickets.refetch(), articles.refetch()]);
    },
  };
}

/**
 * The help center: its collections and articles, or within one collection, with search. With the
 * tenant's AI on and `askAi` given to `createSupport`, searching also asks it.
 */
export function useHelpCenter(options: { collectionId?: string | null; initialQuery?: string } = {}): ListProps {
  const block = useSupport();
  const { copy, client, paths } = block;
  const { navigate, askAi } = block.options;
  const tenantId = useTenant();
  const collectionId = options.collectionId ?? null;
  const [value, setValue] = useState(options.initialQuery ?? "");
  const [query, setQuery] = useState(options.initialQuery?.trim() ?? "");
  const collections = useQuery({ queryKey: key("collections", tenantId), queryFn: () => required(client.helpCollections)({ tenantId }), enabled: !collectionId });
  const articles = useQuery({ queryKey: key("articles", tenantId, collectionId), queryFn: () => required(client.helpArticles)({ tenantId, collectionId }) });
  const hits = useQuery({ queryKey: key("search", tenantId, query), queryFn: () => required(client.searchHelp)(query, { tenantId }), enabled: Boolean(query) });
  const ai = useQuery({ queryKey: key("ai", tenantId), queryFn: () => required(client.helpAiEnabled)({ tenantId }), enabled: Boolean(askAi), staleTime: 5 * 60_000 });
  const context = useCallback(() => ({ platform: block.options.platform ?? "native" }), [block.options.platform]);
  const ask = useHelpAsk({ client, tenantId, askAi, context });
  const aiOn = Boolean(askAi && ai.data);
  const titles = useMemo(() => new Map((articles.data ?? []).map((a) => [a.id, { slug: a.slug, title: a.title }])), [articles.data]);
  const article = (a: { id: string; slug: string; title: string; summary: string | null }): InboxItem => ({
    id: a.id,
    title: a.title,
    ...(a.summary ? { preview: a.summary } : {}),
    onPress: () => navigate(paths.article(a.slug)),
  });
  const known = new Set((collections.data ?? []).map((c) => c.id));
  const items: InboxItem[] = query
    ? (hits.data ?? []).map(article)
    : collectionId
      ? (articles.data ?? []).map(article)
      : [
          ...(collections.data ?? []).map(
            (c): InboxItem => ({ id: c.id, title: c.title, ...(c.description ? { preview: c.description } : {}), onPress: () => navigate(`${paths.help}?collection=${encodeURIComponent(c.id)}`) }),
          ),
          ...(articles.data ?? []).filter((a) => !a.collectionId || !known.has(a.collectionId)).map(article),
        ];
  const reading = query ? hits : articles;
  const header: ReactNode = (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      <NativeSearchBar
        value={value}
        onChange={setValue}
        placeholder={copy.messenger.searchPlaceholder}
        onSubmit={(typed) => {
          const next = typed.trim();
          setQuery(next);
          ask.reset();
        }}
      />
      {aiOn ? <HelpAnswerCard ask={ask} query={query} onConsent={block.options.onAiConsent} titles={titles} copy={copy} onArticle={(slug) => navigate(paths.article(slug))} onTicket={(id) => navigate(paths.thread(id))} /> : null}
    </View>
  );
  return {
    testID: "genesis-support-help",
    headerTitle: copy.messenger.spaces.help,
    header,
    items,
    loading: reading.isPending && Boolean(query || articles.isPending),
    error: reading.isError,
    errorTitle: copy.messenger.helpErrorTitle,
    errorBody: copy.messenger.errorBody,
    emptyTitle: query ? copy.messenger.noResultsTitle : copy.messenger.helpEmptyTitle,
    emptyBody: query ? copy.messenger.noResultsBody : copy.messenger.helpEmptyBody,
    emptyActionLabel: copy.messenger.newMessage,
    onEmptyAction: () => navigate(paths.newMessage),
    refreshing: reading.isRefetching,
    onRefresh: async () => {
      await reading.refetch();
    },
  };
}

export interface HelpArticleProps {
  article: HelpArticle | null;
  loading: boolean;
  /** Read, and it isn't there (or the person can't read it). */
  notFound: boolean;
  error: boolean;
  headerTitle: string;
  copy: SupportCopy;
  onNewMessage: () => void;
}

/** One article, by its slug. */
export function useHelpArticle(slug: string): HelpArticleProps {
  const block = useSupport();
  const { copy, client, paths } = block;
  const tenantId = useTenant();
  const query = useQuery({ queryKey: key("article", tenantId, slug), queryFn: () => required(client.helpArticle)(slug, { tenantId }) });
  return {
    article: query.data ?? null,
    loading: query.isPending,
    notFound: query.isSuccess && !query.data,
    error: query.isError,
    headerTitle: query.data?.title ?? copy.messenger.spaces.help,
    copy,
    onNewMessage: () => block.options.navigate(paths.newMessage),
  };
}

/** An article's words, and the way to a person. */
export function HelpArticleBody({ article, loading, notFound, error, copy, onNewMessage }: HelpArticleProps) {
  if (loading) return <NativeText preset="body-sm" className="text-muted-foreground" style={{ padding: 16 }}>{copy.messenger.aiThinking}</NativeText>;
  if (!article || notFound || error) {
    return (
      <View testID="genesis-support-article-missing" style={{ padding: 16 }}>
        <NativeText>{error ? copy.messenger.helpErrorTitle : copy.messenger.articleNotFound}</NativeText>
      </View>
    );
  }
  return (
    <ScrollView testID="genesis-support-article" contentContainerStyle={{ gap: 12, padding: 16 }}>
      <NativeText preset="h2" accessibilityRole="header">
        {article.title}
      </NativeText>
      {article.body
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <NativeText key={i}>{p.trim()}</NativeText>
        ))}
      <NativeText preset="body-sm" className="text-muted-foreground">{copy.messenger.stillNeedHelp}</NativeText>
      <NativeButton variant="outline" onPress={onNewMessage} testID="genesis-support-article-new">
        {copy.messenger.newMessage}
      </NativeButton>
    </ScrollView>
  );
}

type StartProps = Pick<ThreadPageProps, "messages" | "composer" | "emptyTitle" | "emptyBody" | "testID"> & {
  headerTitle: string;
  failed: boolean;
  /** How soon people hear back, or when someone's back (`replyExpectation`, `officeHours`): shown above the composer, and here for a screen of your own. Null with neither set. */
  expectation: string | null;
};

/**
 * Start a conversation: an empty thread whose first message becomes a ticket, then its thread
 * opens. With `replyExpectation` or `officeHours` given to `createSupport`, it says how soon people
 * hear back, or when someone's back.
 */
export function useStartConversation(): StartProps {
  const block = useSupport();
  const { copy, client, paths } = block;
  const queryClient = useQueryClient();
  const tenantId = useTenant();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const expectation = composeExpectationLine(useReplyExpectation(block.options.replyExpectation, block.options.officeHours), copy);
  return {
    testID: "genesis-support-start",
    headerTitle: copy.messenger.composeTitle,
    messages: [],
    emptyTitle: copy.messenger.composeTitle,
    emptyBody: failed ? copy.messenger.composeFailed : copy.messenger.composePlaceholder,
    failed,
    expectation,
    composer: {
      ...(expectation
        ? {
            above: (
              <NativeText preset="body-sm" className="text-muted-foreground" style={{ paddingHorizontal: 12, paddingTop: 8 }} testID="genesis-support-start-expectation">
                {expectation}
              </NativeText>
            ),
          }
        : {}),
      value: draft,
      onChangeText: setDraft,
      placeholder: copy.messenger.composeLabel,
      sendLabel: copy.feedback.send,
      sending,
      maxLength: 10000,
      onSend: () => {
        const message = draft.trim();
        if (!message || sending) return;
        setSending(true);
        setFailed(false);
        void Promise.resolve(block.collector.collect())
          .then((context) => client.submit({ type: "question", message, context, tenantId }))
          .then(({ id }) => {
            setDraft("");
            void queryClient.invalidateQueries({ queryKey: [SUPPORT_QUERY_ROOT] });
            block.options.navigate(paths.thread(id));
          })
          .catch(() => setFailed(true))
          .finally(() => setSending(false));
      },
    },
  };
}
