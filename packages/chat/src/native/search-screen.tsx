/**
 * @feat:chat
 * `ChatSearchScreen`: a search field and its results, across all your conversations or in one.
 * Each result says who, when and (across conversations) where, with the snippet's matched words
 * highlighted, and a Transcript badge when it was found in a voice note's or video's transcript.
 * Tapping one calls `onOpen`, which the app uses to open the thread at that message
 * (`ChatThreadScreen jumpTo`, which loads earlier pages until it is there). The same rules as
 * the web's `ChatSearch`.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, FlatList, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeBadge, NativeEmptyState, NativeIcon, NativeSearchBar, NativeSkeleton, NativeText } from "@marktiderman/genesis-ui-native/components";
import { formatInboxTime } from "@marktiderman/genesis-ui-native/layouts";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { snippetParts } from "../core/extras";
import type { ChatSearchHit } from "../core/types";
import { useChat, useInbox, usePeople, useSearch } from "../react/index";
import { fill } from "./copy";
import { useChatNative } from "./context";

/** A snippet with its « » marks drawn highlighted, inside one Text (so it wraps as one). */
export function SearchSnippet({ snippet, numberOfLines = 2, testID }: { snippet: string; numberOfLines?: number; testID?: string }) {
  const colors = useThemeRoles();
  return (
    <NativeText testID={testID} preset="body-sm" numberOfLines={numberOfLines}>
      {snippetParts(snippet).map((p, i) =>
        p.match ? (
          <NativeText key={i} preset="body-sm" style={{ fontWeight: "700", color: colors.label, backgroundColor: colors.fill }}>
            {p.text}
          </NativeText>
        ) : (
          <NativeText key={i} preset="body-sm" style={{ color: colors.secondaryLabel }}>
            {p.text}
          </NativeText>
        ),
      )}
    </NativeText>
  );
}

/** The snippet without its marks, for a screen reader. */
export function snippetText(snippet: string): string {
  return snippetParts(snippet)
    .map((p) => p.text)
    .join("");
}

export interface ChatSearchScreenProps {
  /** Search one conversation; all of yours without it. */
  conversationId?: string | null;
  /** Called with the chosen result (open the thread at it). */
  onOpen: (hit: ChatSearchHit) => void;
  /** Names a conversation on results across conversations; the inbox's names by default. */
  conversationTitle?: (conversationId: string) => string;
  debounceMs?: number;
  /** The clock, for tests. */
  now?: () => Date;
  testID?: string;
}

export function ChatSearchScreen({ conversationId, onOpen, conversationTitle, debounceMs, now = () => new Date(), testID = "chat-search" }: ChatSearchScreenProps) {
  const { copy, person: known } = useChatNative();
  const { userId } = useChat();
  const colors = useThemeRoles();
  const [value, setValue] = useState("");
  const { hits, query, isSearching } = useSearch(value, { conversationId, debounceMs });
  // Names for "in …" across conversations, as the inbox shows them (one read, cached with it).
  const inbox = useInbox({});
  const ids = useMemo(() => [...hits.map((h) => h.senderId), ...inbox.items.map((i) => i.otherUserId)], [hits, inbox.items]);
  const people = usePeople(ids);
  const nameOf = useCallback(
    (id: string | null) => (id === userId ? copy.you : ((known(id) ?? (id ? people[id] : undefined))?.name ?? copy.someone)),
    [userId, copy, known, people],
  );
  const titleOf = useCallback(
    (id: string) => {
      if (conversationTitle) return conversationTitle(id);
      const item = inbox.items.find((i) => i.conversationId === id);
      return item?.title ?? (item?.otherUserId ? nameOf(item.otherUserId) : copy.untitled);
    },
    [conversationTitle, inbox.items, nameOf, copy.untitled],
  );

  const short = value.trim().length < 2;
  const announce = short || isSearching ? "" : hits.length === 0 ? copy.searchNoResults : hits.length === 1 ? copy.searchResultsOne : fill(copy.searchResults, { count: hits.length });
  // How many results, said once they settle (VoiceOver and TalkBack).
  useEffect(() => {
    if (announce) AccessibilityInfo.announceForAccessibility?.(announce);
  }, [announce]);
  const field = (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <NativeSearchBar
        testID={`${testID}-field`}
        value={value}
        onChange={setValue}
        placeholder={conversationId ? copy.searchThreadPlaceholder : copy.searchPlaceholder}
        cancelLabel={copy.cancel}
        showCancel={false}
      />
    </View>
  );
  const empty = short ? (
    <NativeText preset="caption" style={{ paddingHorizontal: 20, color: colors.secondaryLabel }} testID={`${testID}-hint`}>
      {copy.searchHint}
    </NativeText>
  ) : isSearching ? (
    <View testID={`${testID}-loading`} style={{ padding: 16, gap: 10 }}>
      <NativeSkeleton height={52} className="w-full" />
      <NativeSkeleton height={52} className="w-full" />
    </View>
  ) : (
    <NativeEmptyState variant="no-results" title={copy.searchNoResults} body={fill(copy.searchNoResultsBody, { query })} testID={`${testID}-empty`} />
  );
  // One list, with the field as its header and the hint, loading and empty states as its empty
  // content: under a large-title or see-through (Liquid Glass) header only a scroll view's automatic
  // content inset moves the content below the bar, as InboxPage does. A plain View at the top of the
  // SafeAreaView drew the field behind the navigation bar, where it couldn't be tapped.
  return (
    <SafeAreaView testID={testID} edges={["left", "right"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      <FlatList
        testID={`${testID}-results`}
        data={short ? [] : hits}
        keyExtractor={(h) => `${h.messageId}:${h.inTranscript}`}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={field}
        ListEmptyComponent={empty}
        renderItem={({ item: h }) => {
          const who = nameOf(h.senderId);
          const where = conversationId ? null : fill(copy.searchIn, { name: titleOf(h.conversationId) });
          const when = formatInboxTime(new Date(h.createdAt), now());
          return (
            <HitRow
              testID={`${testID}-hit-${h.messageId}`}
              accessibilityLabel={[who, where, when, h.inTranscript ? copy.transcript : null, snippetText(h.snippet)].filter(Boolean).join(", ")}
              onPress={() => onOpen(h)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <NativeText preset="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {who}
                </NativeText>
                {where ? (
                  <NativeText preset="caption" numberOfLines={1} style={{ flexShrink: 1, color: colors.secondaryLabel }}>
                    {where}
                  </NativeText>
                ) : null}
                <NativeText preset="caption" style={{ marginLeft: "auto", color: colors.tertiaryLabel }}>
                  {when}
                </NativeText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                {h.inTranscript ? (
                  <NativeBadge variant="muted" testID={`${testID}-transcript-${h.messageId}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <NativeIcon name="mic" size={11} color={colors.secondaryLabel} />
                      <NativeText preset="caption" style={{ color: colors.secondaryLabel }}>
                        {copy.transcript}
                      </NativeText>
                    </View>
                  </NativeBadge>
                ) : null}
                <View style={{ flex: 1 }}>
                  <SearchSnippet snippet={h.snippet} />
                </View>
              </View>
            </HitRow>
          );
        }}
      />
    </SafeAreaView>
  );
}

/**
 * One result's row. A static style, with the pressed state kept here: with a `style` function
 * the row's padding wasn't applied in the starter on iOS 27 (the name and time touched the
 * screen's edges).
 */
function HitRow({ testID, accessibilityLabel, onPress, children }: { testID: string; accessibilityLabel: string; onPress: () => void; children: ReactNode }) {
  const colors = useThemeRoles();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, gap: 4, backgroundColor: pressed ? colors.fill : "transparent" }}
    >
      {children}
    </Pressable>
  );
}
