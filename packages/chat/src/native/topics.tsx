/**
 * @feat:chat
 * The topic bar on native: "All" and each of a conversation's topics as single-choice chips in a
 * row that scrolls sideways, a lock on closed ones, and, for owners and admins, an options button
 * that adds a topic and renames, closes or reopens the one shown (one sheet: the menu, then the
 * name field). `ChatThreadScreen` shows it when the conversation has topics, and reads the
 * messages of the topic chosen. The same rules as the web's `ChatTopicBar`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
import { NativeButton, NativeChip, NativeChipGroup, NativeIcon, NativeInput, NativeListItem, NativeSheet, NativeText, useToast } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { topicKey } from "../core/extras";
import type { ChatRole, ChatTopic, TopicInput } from "../core/types";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { ChatIconButton } from "./icon-button";

const ALL = "__all__";

/** Owners and admins add, rename, close and reopen topics. */
export function canManageTopics(role: ChatRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** A closed topic takes posts only from owners, admins and observers. */
export function topicClosedFor(topic: ChatTopic | null | undefined, role: ChatRole | null | undefined): boolean {
  return Boolean(topic?.closedAt) && role !== "owner" && role !== "admin" && role !== "observer";
}

export type TopicMenuAction = "new" | "rename" | "close" | "reopen";

/** What the options sheet offers: always New; Rename and Close or Reopen when a topic is shown. */
export function topicMenuFor(current: ChatTopic | null | undefined): TopicMenuAction[] {
  if (!current) return ["new"];
  return ["new", "rename", current.closedAt ? "reopen" : "close"];
}

/**
 * Checks a topic's name: its key, or why it can't be saved. Renaming keeps the key (messages
 * carry it), so only a new topic can clash with another's key.
 */
export function checkTopicName(title: string, topics: readonly ChatTopic[], renaming?: string | null): { key: string } | { error: "empty" | "exists" } {
  const name = title.trim();
  if (!name) return { error: "empty" };
  if (renaming) return { key: renaming };
  const key = topicKey(name);
  return topics.some((t) => t.topic === key) ? { error: "exists" } : { key };
}

/**
 * Where the bar scrolls to so a chip shows whole (with `margin` to spare), or null when it already
 * does: a chip past the right edge comes in from the right, one before the left from the left.
 */
export function scrollToShow(chip: { x: number; width: number }, view: { offset: number; width: number }, margin = 8): number | null {
  if (view.width <= 0) return null;
  if (chip.x - margin < view.offset) return Math.max(0, chip.x - margin);
  if (chip.x + chip.width + margin > view.offset + view.width) return Math.max(0, chip.x + chip.width + margin - view.width);
  return null;
}

export interface ChatTopicBarProps {
  topics: ChatTopic[];
  /** The topic shown; null for "All". */
  value: string | null;
  onValueChange: (topic: string | null) => void;
  /** Owners and admins (`canManageTopics(role)`): the options button. */
  canManage?: boolean;
  /** Saves a topic (`useTopics().setTopic`). */
  onSetTopic?: (topic: string, input: TopicInput) => Promise<void>;
  testID?: string;
}

type SheetState = { step: "menu" } | { step: "name"; renaming: string | null };

export function ChatTopicBar({ topics, value, onValueChange, canManage = false, onSetTopic, testID = "chat-topics" }: ChatTopicBarProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = value ? (topics.find((t) => t.topic === value) ?? null) : null;

  // The chosen chip is scrolled into view: a topic just added sits at the end, past the edge.
  const scrollRef = useRef<{ scrollTo?: (o: { x: number; animated?: boolean }) => void } | null>(null);
  const chips = useRef(new Map<string, { x: number; width: number }>());
  const view = useRef({ offset: 0, width: 0 });
  const reveal = useCallback((key: string | null) => {
    const chip = chips.current.get(key ?? ALL);
    if (!chip) return;
    const to = scrollToShow(chip, view.current);
    if (to === null) return;
    view.current.offset = to;
    scrollRef.current?.scrollTo?.({ x: to, animated: true });
  }, []);
  const latestValue = useRef(value);
  latestValue.current = value;
  useEffect(() => reveal(value), [value, reveal]);
  const trackOffset = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    view.current.offset = e.nativeEvent.contentOffset.x;
  };
  const onChipLayout = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    chips.current.set(key, { x, width });
    // A new topic is chosen before its chip exists: it is shown once the chip has its place.
    if (key === (latestValue.current ?? ALL)) reveal(latestValue.current);
  };

  const close = () => {
    if (busy) return;
    setSheet(null);
    setError(null);
  };

  const run = async (action: TopicMenuAction) => {
    if (action === "new" || action === "rename") {
      setTitle(action === "rename" ? (current?.title ?? "") : "");
      setError(null);
      setSheet({ step: "name", renaming: action === "rename" ? (current?.topic ?? null) : null });
      return;
    }
    if (!current || !onSetTopic) return;
    setSheet(null);
    try {
      await onSetTopic(current.topic, { closed: action === "close" });
      toast.show({ title: fill(action === "close" ? copy.topicClosedDone : copy.topicReopenedDone, { name: current.title }), variant: "success", duration: 1500 });
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : copy.actionFailed, variant: "destructive" });
    }
  };

  const save = async (renaming: string | null) => {
    if (!onSetTopic) return;
    const checked = checkTopicName(title, topics, renaming);
    if ("error" in checked) {
      setError(checked.error === "exists" ? copy.topicExists : null);
      return;
    }
    setBusy(true);
    try {
      await onSetTopic(checked.key, renaming ? { title: title.trim() } : { title: title.trim(), position: topics.length });
      setSheet(null);
      setTitle("");
      if (!renaming) onValueChange(checked.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.groupedBackground, paddingLeft: 8 }}>
      <ScrollView
        ref={scrollRef as never}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={copy.topics}
        contentContainerStyle={{ paddingVertical: 4, paddingRight: 8 }}
        style={{ flex: 1 }}
        onLayout={(e: LayoutChangeEvent) => {
          view.current.width = e.nativeEvent.layout.width;
          reveal(latestValue.current);
        }}
        onScroll={trackOffset}
        onScrollEndDrag={trackOffset}
        onMomentumScrollEnd={trackOffset}
        scrollEventThrottle={64}
      >
        <NativeChipGroup mode="single" value={value ?? ALL} onChange={(v) => onValueChange(v === ALL ? null : (v as string))} className="flex-nowrap" testID={`${testID}-group`}>
          <View onLayout={onChipLayout(ALL)}>
            <NativeChip value={ALL} testID={`${testID}-all`}>
              {copy.topicAll}
            </NativeChip>
          </View>
          {topics.map((t) => (
            <View key={t.topic} onLayout={onChipLayout(t.topic)}>
              <NativeChip value={t.topic} testID={`${testID}-${t.topic}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {t.closedAt ? <NativeIcon name="lock" size={13} color={colors.secondaryLabel} label={copy.topicClosed} /> : null}
                  <NativeText preset="body-sm" numberOfLines={1} style={{ maxWidth: 180, fontWeight: value === t.topic ? "600" : "400", color: value === t.topic ? colors.tint : colors.label }}>
                    {t.title}
                  </NativeText>
                </View>
              </NativeChip>
            </View>
          ))}
        </NativeChipGroup>
      </ScrollView>
      {canManage && onSetTopic ? <ChatIconButton testID={`${testID}-menu`} icon="more" label={copy.topicOptions} onPress={() => setSheet({ step: "menu" })} /> : null}
      <NativeSheet open={sheet !== null} onOpenChange={(o) => (o ? undefined : close())} fitContent testID={`${testID}-sheet`}>
        {sheet?.step === "name" ? (
          <View style={{ padding: 16, gap: 12 }}>
            <NativeText preset="h4" accessibilityRole="header">
              {sheet.renaming ? copy.topicRename : copy.topicNew}
            </NativeText>
            <NativeInput
              testID={`${testID}-name`}
              label={copy.topicName}
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setError(null);
              }}
              placeholder={copy.topicNamePlaceholder}
              maxLength={160}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void save(sheet.renaming)}
              error={error ?? undefined}
            />
            <NativeButton testID={`${testID}-save`} onPress={() => void save(sheet.renaming)} loading={busy} disabled={!title.trim()}>
              {sheet.renaming ? copy.topicSave : copy.topicAdd}
            </NativeButton>
          </View>
        ) : (
          <View>
            {topicMenuFor(current).map((action) => (
              <NativeListItem
                key={action}
                testID={`${testID}-${action}`}
                title={action === "new" ? copy.topicNew : action === "rename" ? copy.topicRename : action === "close" ? copy.topicClose : copy.topicReopen}
                leading={<NativeIcon name={action === "new" ? "plus" : action === "rename" ? "edit" : "lock"} />}
                onPress={() => void run(action)}
              />
            ))}
          </View>
        )}
      </NativeSheet>
    </View>
  );
}
