/**
 * The support screens as hooks that return a Genesis layout's props, so each
 * route file is a layout and one hook:
 *
 *   const inbox = useSupportInbox();          → <InboxPage {...inbox} />
 *   const thread = useSupportThread(id);      → <ThreadPage {...thread} />
 *   const board = useIdeaBoard();             → <InboxPage {...board} />
 *   const shipped = useShippedIdeas();        → <InboxPage {...shipped} />
 *
 * Data is read and cached with TanStack Query (the native shell's client),
 * under the `genesis-support` key root, never persisted.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NativeButton, NativeInput } from "@marktiderman/genesis-ui-native/components";
import type { InboxItem, InboxPageProps, ThreadMessage, ThreadPageProps } from "@marktiderman/genesis-ui-native/layouts";
import type { SupportIdea, SupportReport } from "../client";
import { fill } from "../copy";
import { SUPPORT_QUERY_ROOT, useOptionalSupport, useSupport } from "./support";

const key = (...parts: string[]) => [SUPPORT_QUERY_ROOT, ...parts];

type InboxProps = Pick<
  InboxPageProps,
  "items" | "refreshing" | "onRefresh" | "emptyTitle" | "emptyBody" | "emptyActionLabel" | "onEmptyAction" | "sectionTitle" | "header" | "testID"
> & { headerTitle: string; loading: boolean; error: boolean };

/** Help: the person's reports, newest first, with unread staff replies, and links to the idea board. */
export function useSupportInbox(): InboxProps {
  const block = useSupport();
  const { copy, paths, client } = block;
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: key("reports"), queryFn: () => client.myReports() });
  const navigate = block.options.navigate;

  const confirmDelete = (report: SupportReport) =>
    Alert.alert(copy.inbox.deleteConfirmTitle, copy.inbox.deleteConfirmBody, [
      { text: copy.inbox.cancel, style: "cancel" },
      {
        text: copy.inbox.delete,
        style: "destructive",
        onPress: () => {
          void client
            .deleteReport(report.id)
            .then(() => queryClient.invalidateQueries({ queryKey: key("reports") }))
            .catch(() => Alert.alert(copy.feedback.failedTitle, copy.feedback.failedBody));
        },
      },
    ]);

  const items: InboxItem[] = (query.data ?? []).map((report) => ({
    id: report.id,
    title: report.title || firstLine(report.message),
    preview: report.title ? firstLine(report.message) : undefined,
    timestamp: report.lastStaffReplyAt ?? report.createdAt,
    unread: report.unread,
    meta: `${copy.feedback.types[report.type]} · ${copy.status[report.status]}`,
    onPress: () => navigate(paths.thread(report.id)),
    swipeActions: [{ id: "delete", label: copy.inbox.delete, destructive: true, onPress: () => confirmDelete(report) }],
    testID: `genesis-support-report-${report.id}`,
  }));

  const header = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      <NativeButton size="sm" onPress={() => void block.openFeedback({ screenshot: false })} testID="genesis-support-inbox-new">
        {copy.inbox.sendFeedback}
      </NativeButton>
      {block.options.ideas === false ? null : (
        <>
          <NativeButton size="sm" variant="outline" onPress={() => navigate(paths.ideas)} testID="genesis-support-inbox-ideas">
            {copy.inbox.ideaBoard}
          </NativeButton>
          <NativeButton size="sm" variant="outline" onPress={() => navigate(paths.shipped)} testID="genesis-support-inbox-shipped">
            {copy.inbox.shipped}
          </NativeButton>
        </>
      )}
    </View>
  );

  return {
    testID: "genesis-support-inbox",
    headerTitle: copy.inbox.title,
    items,
    loading: query.isPending,
    error: query.isError,
    refreshing: query.isRefetching,
    onRefresh: async () => {
      await query.refetch();
    },
    sectionTitle: items.length ? copy.inbox.sectionTitle : undefined,
    header,
    emptyTitle: copy.inbox.emptyTitle,
    emptyBody: copy.inbox.emptyBody,
  };
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

type ThreadProps = Pick<ThreadPageProps, "messages" | "composer" | "closedNotice" | "readAt" | "readLabel" | "emptyTitle" | "emptyBody" | "testID"> & {
  headerTitle: string;
  report: SupportReport | null;
  loading: boolean;
};

const CLOSED = new Set(["addressed", "wont_fix"]);

/** One report as a conversation: the report itself, then the replies. Marks it read as it opens and as replies arrive. */
export function useSupportThread(reportId: string, options: { pollMs?: number } = {}): ThreadProps {
  const block = useSupport();
  const { copy, client } = block;
  const queryClient = useQueryClient();
  const poll = options.pollMs ?? 30_000;
  const report = useQuery({ queryKey: key("report", reportId), queryFn: () => client.report(reportId), refetchInterval: poll });
  const replies = useQuery({ queryKey: key("replies", reportId), queryFn: () => client.replies(reportId), refetchInterval: poll });
  const attachments = useQuery({ queryKey: key("attachments", reportId), queryFn: () => client.attachments(reportId), staleTime: 50 * 60_000 });
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<{ id: string; body: string; at: string }[]>([]);

  const lastStaff = report.data?.lastStaffReplyAt ?? null;
  useEffect(() => {
    if (!report.data) return;
    void client
      .markRead(reportId)
      .then(() => queryClient.invalidateQueries({ queryKey: key("reports") }))
      .catch(() => undefined);
    // Again when a new staff reply arrives.
  }, [client, reportId, lastStaff, Boolean(report.data), queryClient]);

  const send = useMutation({
    mutationFn: (body: string) => client.reply(reportId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key("replies", reportId) });
      void queryClient.invalidateQueries({ queryKey: key("report", reportId) });
    },
    onError: (_error, body) => setFailed((f) => [...f, { id: `failed-${Date.now()}`, body, at: new Date().toISOString() }]),
  });

  const r = report.data ?? null;
  const messages: ThreadMessage[] = useMemo(() => {
    if (!r) return [];
    const first: ThreadMessage = {
      id: r.id,
      body: r.message,
      mine: true,
      timestamp: r.createdAt,
      attachments: (attachments.data ?? [])
        .filter((a) => a.url)
        .map((a) => ({ id: a.id, uri: a.url!, width: a.width ?? undefined, height: a.height ?? undefined, accessibilityLabel: copy.thread.screenshot })),
    };
    const rest: ThreadMessage[] = (replies.data ?? []).map((reply) => ({
      id: reply.id,
      body: reply.body,
      mine: reply.mine,
      authorName: reply.fromStaff ? copy.thread.support : undefined,
      timestamp: reply.createdAt,
    }));
    const pending: ThreadMessage[] = send.isPending && send.variables ? [{ id: "sending", body: send.variables, mine: true, timestamp: new Date().toISOString(), status: "sending" }] : [];
    const failedMessages: ThreadMessage[] = failed.map((f) => ({
      id: f.id,
      body: f.body,
      mine: true,
      timestamp: f.at,
      status: "failed",
      onRetry: () => {
        setFailed((all) => all.filter((x) => x.id !== f.id));
        send.mutate(f.body);
      },
    }));
    return [first, ...rest, ...pending, ...failedMessages];
  }, [r, replies.data, attachments.data, send.isPending, send.variables, failed, copy, send]);

  const closed = r ? CLOSED.has(r.status) : false;
  return {
    testID: "genesis-support-thread",
    headerTitle: r ? r.title || copy.feedback.types[r.type] : copy.thread.title,
    report: r,
    loading: report.isPending,
    messages,
    readAt: r?.staffReadAt ?? null,
    readLabel: copy.thread.read,
    emptyTitle: copy.thread.emptyTitle,
    emptyBody: copy.thread.emptyBody,
    closedNotice: copy.thread.closed,
    composer: closed
      ? null
      : {
          value: draft,
          onChangeText: setDraft,
          placeholder: copy.thread.placeholder,
          sendLabel: copy.thread.send,
          sending: send.isPending,
          maxLength: 10000,
          onSend: () => {
            const body = draft.trim();
            if (!body || send.isPending) return;
            setDraft("");
            send.mutate(body);
          },
        },
  };
}

/** A vote toggle for an idea row. */
export function VoteButton({ idea, onToggle, testID }: { idea: SupportIdea; onToggle: () => void; testID?: string }) {
  const { copy } = useSupport();
  const count = idea.voteCount === 1 ? copy.ideas.oneVote : fill(copy.ideas.votes, { count: idea.voteCount });
  const open = idea.status === "open" || idea.status === "planned" || idea.status === "in_progress";
  return (
    <View accessibilityLabel={`${idea.voted ? copy.ideas.voted : copy.ideas.vote}, ${count}`}>
      <NativeButton size="sm" variant={idea.voted ? "default" : "outline"} onPress={onToggle} disabled={!open && !idea.voted} testID={testID}>
        {`▲ ${idea.voteCount}`}
      </NativeButton>
    </View>
  );
}

type BoardProps = Pick<InboxPageProps, "items" | "refreshing" | "onRefresh" | "emptyTitle" | "emptyBody" | "header" | "testID"> & { headerTitle: string };

/** The idea board: most votes first, a vote button on each, and a field to suggest one. */
export function useIdeaBoard(): BoardProps {
  const block = useSupport();
  const { copy, client } = block;
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: key("ideas"), queryFn: () => client.ideas() });
  const [title, setTitle] = useState("");

  const toggle = useMutation({
    mutationFn: (idea: SupportIdea) => (idea.voted ? client.unvote(idea.id) : client.vote(idea.id)),
    onMutate: async (idea) => {
      await queryClient.cancelQueries({ queryKey: key("ideas") });
      const before = queryClient.getQueryData<SupportIdea[]>(key("ideas"));
      queryClient.setQueryData<SupportIdea[]>(key("ideas"), (list) =>
        list?.map((i) => (i.id === idea.id ? { ...i, voted: !i.voted, voteCount: Math.max(0, i.voteCount + (i.voted ? -1 : 1)) } : i)),
      );
      return { before };
    },
    onError: (_e, _idea, context) => {
      if (context?.before) queryClient.setQueryData(key("ideas"), context.before);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key("ideas") }),
  });

  const suggest = useMutation({
    mutationFn: (t: string) => client.suggestIdea({ title: t }),
    onSuccess: () => {
      setTitle("");
      void queryClient.invalidateQueries({ queryKey: key("ideas") });
    },
    onError: (e) => Alert.alert(copy.feedback.failedTitle, (e as { code?: string }).code === "GS429" ? copy.feedback.rateLimited : copy.feedback.failedBody),
  });

  const items: InboxItem[] = (query.data ?? []).map((idea) => ({
    id: idea.id,
    title: idea.title,
    preview: idea.body ?? undefined,
    meta: copy.ideas.statuses[idea.status],
    leading: <View />,
    trailing: <VoteButton idea={idea} onToggle={() => toggle.mutate(idea)} testID={`genesis-support-vote-${idea.id}`} />,
    testID: `genesis-support-idea-${idea.id}`,
  }));

  const header: ReactNode = (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <NativeInput
          testID="genesis-support-idea-title"
          label={copy.ideas.titleLabel}
          placeholder={copy.ideas.titlePlaceholder}
          value={title}
          onChangeText={setTitle}
          maxLength={140}
        />
      </View>
      <NativeButton
        onPress={() => title.trim().length >= 3 && suggest.mutate(title.trim())}
        disabled={title.trim().length < 3}
        loading={suggest.isPending}
        testID="genesis-support-idea-submit"
      >
        {copy.ideas.submit}
      </NativeButton>
    </View>
  );

  return {
    testID: "genesis-support-ideas",
    headerTitle: copy.ideas.title,
    items,
    refreshing: query.isRefetching,
    onRefresh: async () => {
      await query.refetch();
    },
    header,
    emptyTitle: copy.ideas.emptyTitle,
    emptyBody: copy.ideas.emptyBody,
  };
}

/** "You asked, we shipped": the shipped ideas the person suggested or voted for, with the FeatureId each shipped as. */
export function useShippedIdeas(): Omit<BoardProps, "header"> {
  const { copy, client } = useSupport();
  const query = useQuery({ queryKey: key("shipped"), queryFn: () => client.shippedForMe() });
  const items: InboxItem[] = (query.data ?? []).map((idea) => ({
    id: idea.id,
    title: idea.title,
    preview: idea.body ?? undefined,
    timestamp: idea.shippedAt ?? undefined,
    meta: idea.featureId ? fill(copy.shipped.shippedAs, { feature: idea.featureId }) : copy.ideas.statuses.shipped,
    leading: <View />,
    testID: `genesis-support-shipped-${idea.id}`,
  }));
  return {
    testID: "genesis-support-shipped",
    headerTitle: copy.shipped.title,
    items,
    refreshing: query.isRefetching,
    onRefresh: async () => {
      await query.refetch();
    },
    emptyTitle: copy.shipped.emptyTitle,
    emptyBody: copy.shipped.emptyBody,
  };
}

/**
 * "Send feedback", for a devtools panel's slot or any screen: captures the
 * screen, then opens the feedback screen. Renders nothing when support is off.
 */
export function SendFeedbackButton({ testID = "genesis-support-send-feedback-button", screenshot = true }: { testID?: string; screenshot?: boolean }) {
  const block = useOptionalSupport();
  if (!block) return null;
  return (
    <NativeButton variant="outline" onPress={() => void block.openFeedback({ screenshot })} testID={testID}>
      {block.copy.settings.sendFeedback}
    </NativeButton>
  );
}
