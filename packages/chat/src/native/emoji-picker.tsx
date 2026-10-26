/**
 * @feat:chat
 * The full emoji picker on genesis-ui-native: a search bar, a row of
 * category tabs (Recent first once there are any), and a grid of emoji.
 * Every emoji is bundled (`emoji-data.ts`) and drawn by the system font:
 * opening it fetches nothing. Recent emoji are kept per person with their
 * drafts (`modules.drafts`), so signing out clears them.
 *
 * `ChatEmojiPicker` is the content, for a sheet of your own (the long-press
 * sheet's "+" swaps it in); `ChatEmojiPickerSheet` is it in a NativeSheet
 * (the composer's emoji button).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { NativeEmptyState, NativeIcon, NativeSearchBar, NativeSheet, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import type { ChatNativeCopy } from "./copy";
import { useChatNative } from "./context";
import { EMOJI_CATEGORIES, emojiEntry, emojiInCategory, loadRecentEmoji, pushRecentEmoji, saveRecentEmoji, searchEmoji, type EmojiCategoryId, type EmojiEntry } from "./emoji";

export interface ChatEmojiPickerProps {
  onSelect: (emoji: string) => void;
  /** The signed-in person, whose recent emoji are kept (with `modules.drafts`). Without it, none are kept. */
  userId?: string | null;
  /** Points tall for the grid. Default about 40% of the window. */
  height?: number;
  testID?: string;
}

type Tab = EmojiCategoryId | "recent";

const CATEGORY_COPY: Record<EmojiCategoryId, keyof ChatNativeCopy> = {
  smileys: "emojiSmileys",
  people: "emojiPeople",
  nature: "emojiNature",
  food: "emojiFood",
  travel: "emojiTravel",
  activities: "emojiActivities",
  objects: "emojiObjects",
  symbols: "emojiSymbols",
  flags: "emojiFlags",
};

const CELL = 44;

// Recents read once per person per launch, then kept here as they change.
const recentCache = new Map<string, string[]>();

// Whose stored recents were read this launch (and merged into the cache).
const loaded = new Set<string>();

/** Forgets the recent emoji held in memory (one person's, or everyone's): call it on sign-out, with `clearDrafts`. */
export function forgetRecentEmoji(userId?: string): void {
  if (userId) {
    recentCache.delete(userId);
    loaded.delete(userId);
  } else {
    recentCache.clear();
    loaded.clear();
  }
}

export function ChatEmojiPicker({ onSelect, userId = null, height, testID = "chat-emoji-picker" }: ChatEmojiPickerProps) {
  const { modules, copy } = useChatNative();
  const colors = useThemeRoles();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Its own width once laid out (a sheet's padding), the window's until then.
  const [width, setWidth] = useState(windowWidth);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => (userId ? (recentCache.get(userId) ?? []) : []));
  const [tab, setTab] = useState<Tab>(recents.length ? "recent" : "smileys");
  const storage = modules.drafts;

  useEffect(() => {
    if (!userId || !storage || loaded.has(userId)) return;
    loaded.add(userId);
    let live = true;
    void loadRecentEmoji(storage, userId).then((stored) => {
      // Picked while it loaded: those come first, and the merged list is what's kept.
      const picked = recentCache.get(userId) ?? [];
      const list = picked.reduceRight((acc, e) => pushRecentEmoji(acc, e), stored);
      recentCache.set(userId, list);
      if (picked.length) void saveRecentEmoji(storage, userId, list);
      if (!live || list.length === 0) return;
      setRecents(list);
      setTab((t) => (t === "smileys" ? "recent" : t));
    });
    return () => {
      live = false;
    };
  }, [userId, storage]);

  const columns = Math.max(6, Math.floor(width / CELL));
  const gridHeight = height ?? Math.round(windowHeight * 0.4);
  const searching = query.trim().length > 0;
  const data: readonly EmojiEntry[] = useMemo(() => {
    if (searching) return searchEmoji(query);
    if (tab === "recent") return recents.map(emojiEntry);
    return emojiInCategory(tab);
  }, [searching, query, tab, recents]);

  const listRef = useRef<{ scrollToOffset?: (o: { offset: number; animated: boolean }) => void } | null>(null);
  const choose = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      if (!userId) return;
      const next = pushRecentEmoji(recentCache.get(userId) ?? [], emoji);
      // Kept for next time; the grid on screen doesn't reorder under the finger.
      recentCache.set(userId, next);
      if (storage) void saveRecentEmoji(storage, userId, next);
    },
    [onSelect, userId, storage],
  );
  // The columns share the width, so the grid fills it edge to edge.
  const cellWidth = Math.floor(width / columns);
  const renderItem = useCallback(
    ({ item }: { item: EmojiEntry }) => <EmojiCell entry={item} width={cellWidth} onPress={choose} testID={`${testID}-emoji-${item.emoji}`} />,
    [choose, testID, cellWidth],
  );

  const tabs: { id: Tab; label: string; icon: string | null }[] = [
    ...(recents.length ? [{ id: "recent" as const, label: copy.recentEmoji, icon: null }] : []),
    ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: copy[CATEGORY_COPY[c.id]] as string, icon: c.icon })),
  ];
  const heading = searching ? null : (tabs.find((t) => t.id === tab)?.label ?? null);

  return (
    <View testID={testID} style={{ gap: 8 }} onLayout={(e) => e.nativeEvent.layout.width > 0 && setWidth(e.nativeEvent.layout.width)}>
      <NativeSearchBar value={query} onChange={setQuery} placeholder={copy.searchEmoji} cancelLabel={copy.cancel} testID={`${testID}-search`} />
      {searching ? null : (
        <View accessibilityRole="tablist" testID={`${testID}-tabs`} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {tabs.map((t) => {
            const on = t.id === tab;
            return (
              <Pressable
                key={t.id}
                testID={`${testID}-tab-${t.id}`}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setTab(t.id);
                  listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
                }}
                style={{ minWidth: 36, height: 44, flexGrow: 1, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: on ? colors.fill : undefined }}
              >
                {t.icon ? (
                  <NativeText style={{ fontSize: 20, lineHeight: 26, opacity: on ? 1 : 0.55 }}>{t.icon}</NativeText>
                ) : (
                  <NativeIcon name="clock" size={20} color={on ? colors.label : colors.secondaryLabel} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
      {heading ? (
        <NativeText preset="caption" accessibilityRole="header" style={{ color: colors.secondaryLabel, fontWeight: "600", paddingHorizontal: 4 }}>
          {heading}
        </NativeText>
      ) : null}
      <View style={{ height: gridHeight }}>
        {data.length === 0 ? (
          <NativeEmptyState variant="no-results" title={copy.noEmoji} testID={`${testID}-empty`} />
        ) : (
          <FlatList
            ref={listRef as never}
            key={columns}
            testID={`${testID}-grid`}
            data={data as EmojiEntry[]}
            numColumns={columns}
            keyExtractor={(e) => e.emoji}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={columns * 8}
            // With numColumns, FlatList lays out rows: the index here is a row's.
            getItemLayout={(_d, row) => ({ length: CELL, offset: CELL * row, index: row })}
          />
        )}
      </View>
    </View>
  );
}

const EmojiCell = memo(function EmojiCell({ entry, width, onPress, testID }: { entry: EmojiEntry; width: number; onPress: (emoji: string) => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={entry.label}
      onPress={() => onPress(entry.emoji)}
      style={{ width: Math.max(CELL, width), height: CELL, alignItems: "center", justifyContent: "center" }}
    >
      {/* A line height of its own: the text preset's is a body line's and clips a 28pt glyph. */}
      <NativeText style={{ fontSize: 28, lineHeight: 36 }} accessible={false}>
        {entry.emoji}
      </NativeText>
    </Pressable>
  );
});

export interface ChatEmojiPickerSheetProps extends Omit<ChatEmojiPickerProps, "onSelect"> {
  open: boolean;
  onClose: () => void;
  /** An emoji was chosen. The sheet stays open, for another. */
  onSelect: (emoji: string) => void;
}

/** The picker in a sheet, with a title and Done. */
export function ChatEmojiPickerSheet({ open, onClose, onSelect, testID = "chat-emoji-sheet", ...rest }: ChatEmojiPickerSheetProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  return (
    <NativeSheet open={open} onOpenChange={(o) => (o ? undefined : onClose())} testID={testID}>
      <View style={{ gap: 4, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <NativeText preset="h4" accessibilityRole="header">
            {copy.emojiPicker}
          </NativeText>
          <Pressable testID={`${testID}-done`} accessibilityRole="button" accessibilityLabel={copy.closeViewer} onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <NativeIcon name="close" size={22} color={colors.secondaryLabel} />
          </Pressable>
        </View>
        {open ? <ChatEmojiPicker onSelect={onSelect} testID={`${testID}-picker`} {...rest} /> : null}
      </View>
    </NativeSheet>
  );
}
