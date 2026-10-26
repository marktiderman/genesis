/**
 * The idea board: InboxPage rows, each with "N votes" and a vote button at
 * the end. A vote shows at once and goes through the offline queue
 * (`createVoteQueue`), so it is never lost to a dropped connection; a vote the
 * source refuses for good is rolled back with an error haptic.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { NativeButton } from "@marktiderman/genesis-ui-native/components";
import { InboxPage, type InboxItem, type InboxPageProps } from "@marktiderman/genesis-ui-native/layouts";
import { createVoteQueue, type ProductIdea, type ProductSource, type VoteFlushResult, type VoteQueue } from "../app";
import { mergeCopy, type ProductCopyInput } from "./copy";
import { haptic, type HapticsLike } from "./haptics";

/** Options for {@link useIdeaBoard}. */
export interface IdeaBoardOptions {
  source: ProductSource;
  /**
   * The vote queue. Default: one in memory over `source`. Pass
   * `createVoteQueue({ source, store: storageVoteQueueStore(AsyncStorage) })`
   * (made once, outside render) to keep votes across a relaunch.
   */
  queue?: VoteQueue;
  /** `import * as Haptics from "expo-haptics"`. */
  haptics?: HapticsLike;
  /**
   * Called with a listener to run when the connection comes back; returns the
   * unsubscribe. With NetInfo: `(run) => NetInfo.addEventListener((s) => s.isConnected && run())`.
   */
  onReconnect?: (listener: () => void) => () => void;
  /** A tap on a row (its detail). Without it rows aren't tappable; the vote button always is. */
  onOpenIdea?: (idea: ProductIdea) => void;
  copy?: ProductCopyInput;
  /** Default `"product-ideas"`. */
  testID?: string;
}

/** What {@link useIdeaBoard} returns: InboxPage's props, plus the screen's title and a flush. */
export type IdeaBoard = Pick<
  InboxPageProps,
  "items" | "loading" | "error" | "refreshing" | "onRefresh" | "emptyTitle" | "emptyBody" | "errorTitle" | "errorBody" | "testID"
> & {
  headerTitle: string;
  /** Send queued votes now (also runs on start, after each vote and on reconnect). */
  flush: () => Promise<VoteFlushResult>;
};

/** The vote button at the end of a row. */
export interface VoteButtonProps {
  voted: boolean;
  onPress: () => void;
  label: string;
  testID: string;
}

export function VoteButton({ voted, onPress, label, testID }: VoteButtonProps) {
  return (
    <NativeButton size="sm" variant={voted ? "default" : "outline"} onPress={onPress} testID={testID}>
      {label}
    </NativeButton>
  );
}

/** The idea board as InboxPage props: `<InboxPage {...useIdeaBoard({ source })} />`. */
export function useIdeaBoard(options: IdeaBoardOptions): IdeaBoard {
  const { source, haptics, onReconnect, onOpenIdea, testID = "product-ideas" } = options;
  const copy = useMemo(() => mergeCopy(options.copy), [options.copy]);
  // The latest props, read at call time: an inline `source` or `haptics` never restarts the board.
  const latest = useRef({ source, haptics });
  latest.current = { source, haptics };
  const [ownQueue] = useState(() =>
    createVoteQueue({ source: { vote: (id) => latest.current.source.vote(id), unvote: (id) => latest.current.source.unvote(id) } }),
  );
  const queue = options.queue ?? ownQueue;
  const [ideas, setIdeas] = useState<ProductIdea[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const alive = useRef(true);
  const read = useRef(0);

  const load = useCallback(async () => {
    const mine = ++read.current;
    try {
      const next = await latest.current.source.ideas();
      if (alive.current && mine === read.current) {
        setIdeas(next);
        setError(false);
      }
    } catch {
      if (alive.current && mine === read.current) setError(true);
    }
  }, []);

  const flush = useCallback(async () => {
    const result = await queue.flush();
    if (!alive.current) return result;
    if (result.sent.length) {
      // The source has these now: keep its copy in step until the next read.
      const sent = new Map(result.sent.map((s) => [s.ideaId, s.voted]));
      setIdeas((list) =>
        list?.map((i) => {
          const voted = sent.get(i.id);
          return voted === undefined || voted === i.voted ? i : { ...i, voted, votes: Math.max(0, i.votes + (voted ? 1 : -1)) };
        }) ?? list,
      );
    }
    if (result.refused.length) {
      haptic(latest.current.haptics, "refused");
      void load();
    }
    return result;
  }, [queue, load]);

  useEffect(() => {
    alive.current = true;
    const stop = queue.subscribe(rerender);
    void load();
    void queue.load().then(() => flush());
    const offline = onReconnect?.(() => void flush());
    return () => {
      alive.current = false;
      stop();
      offline?.();
    };
    // `onReconnect` is read once, at mount.
  }, [queue, load, flush]);

  const toggle = (idea: ProductIdea) => {
    haptic(latest.current.haptics, "vote");
    void queue.toggle(idea).then(() => flush());
  };

  const shown = queue.apply(ideas ?? []);
  const items: InboxItem[] = shown.map((idea) => {
    const server = ideas!.find((i) => i.id === idea.id)!;
    return {
      id: idea.id,
      title: idea.title,
      preview: idea.body,
      meta: `${copy.ideas.votes(idea.votes)} · ${copy.ideas.statuses[idea.status]}`,
      onPress: onOpenIdea ? () => onOpenIdea(idea) : undefined,
      // Swipe, long press or a screen reader action: the same vote, for people who don't see the button.
      swipeActions: [{ id: "vote", label: idea.voted ? copy.ideas.removeVote : copy.ideas.vote, onPress: () => toggle(server) }],
      trailing: <VoteButton voted={idea.voted} label={idea.voted ? copy.ideas.voted : copy.ideas.vote} onPress={() => toggle(server)} testID={`${testID}-vote-${idea.id}`} />,
      testID: `${testID}-idea-${idea.id}`,
    };
  });

  return {
    testID,
    headerTitle: copy.ideas.title,
    items,
    loading: ideas === null && !error,
    error,
    refreshing,
    onRefresh: async () => {
      setRefreshing(true);
      try {
        await Promise.all([load(), flush()]);
      } finally {
        if (alive.current) setRefreshing(false);
      }
    },
    emptyTitle: copy.ideas.emptyTitle,
    emptyBody: copy.ideas.emptyBody,
    errorTitle: copy.ideas.errorTitle,
    errorBody: copy.ideas.errorBody,
    flush,
  };
}

/** The idea board screen. Put `getInboxPageStackOptions({ headerTitle })` on its `<Stack.Screen>`. */
export function IdeaBoardScreen(props: IdeaBoardOptions) {
  const { headerTitle: _title, flush: _flush, ...board } = useIdeaBoard(props);
  return <InboxPage {...board} />;
}
