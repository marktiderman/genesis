/**
 * @feat:chat
 * `ChatBroadcastSheet`: write one message and send it into many of your conversations at once
 * (each person's own conversation with you), so each gets it on their own and their reply comes
 * back to you privately. Pick conversations from the inbox (filter, select all), then send. Show
 * it only to the people your app lets broadcast; the database still checks each conversation
 * (`can_post`) and says how many it reached. The same rules as the web's `ChatBroadcast`.
 */
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  NativeAvatar,
  NativeButton,
  NativeCheckbox,
  NativeEmptyState,
  NativeInlineAlert,
  NativeSearchBar,
  NativeSheet,
  NativeSheetScrollView,
  NativeSkeleton,
  NativeText,
  NativeTextarea,
  useToast,
} from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { CHAT_LIMITS } from "../core/media";
import type { ChatInboxItem } from "../core/types";
import { useBroadcast, useInbox, usePeople } from "../react/index";
import { fill } from "./copy";
import { initials, useChatNative, type ChatPerson } from "./context";

/** What a broadcast's toast says: all reached, one, or some of them. */
export function broadcastOutcome(sent: number, picked: number, copy: { broadcastSent: string; broadcastSentOne: string; broadcastSentSome: string }): { title: string; partial: boolean } {
  if (sent < picked) return { title: fill(copy.broadcastSentSome, { count: sent, total: picked }), partial: true };
  return { title: sent === 1 ? copy.broadcastSentOne : fill(copy.broadcastSent, { count: sent }), partial: false };
}

/** Rows to pick from: the filter's, named as the inbox names them, in name order, matching the query. */
export function broadcastRows(
  items: readonly ChatInboxItem[],
  opts: { filter?: (item: ChatInboxItem) => boolean; person: (id: string | null) => ChatPerson | undefined; untitled: string; query?: string },
): { item: ChatInboxItem; title: string; avatarUrl: string | null }[] {
  const q = opts.query?.trim().toLowerCase() ?? "";
  return items
    .filter((i) => !i.archived && (opts.filter ? opts.filter(i) : true))
    .map((i) => {
      const other = i.otherUserId ? opts.person(i.otherUserId) : undefined;
      return { item: i, title: i.title ?? other?.name ?? opts.untitled, avatarUrl: other?.avatarUrl ?? null };
    })
    .filter((r) => !q || r.title.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export interface ChatBroadcastSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only this kind of conversation (`direct`, say). */
  kind?: string;
  /** Which inbox rows may be picked; every one by default. */
  filter?: (item: ChatInboxItem) => boolean;
  /** Called with how many it went to, after a send. */
  onSent?: (sent: number, picked: number) => void;
  testID?: string;
}

export function ChatBroadcastSheet({ open, onOpenChange, kind, filter, onSent, testID = "chat-broadcast" }: ChatBroadcastSheetProps) {
  const { copy, person: known } = useChatNative();
  const colors = useThemeRoles();
  const toast = useToast();
  const inbox = useInbox({ kind, limit: 200 });
  const { send, sending } = useBroadcast();
  const people = usePeople(useMemo(() => inbox.items.map((i) => i.otherUserId), [inbox.items]));
  const person = (id: string | null) => known(id) ?? (id ? people[id] : undefined);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  const all = broadcastRows(inbox.items, { filter, person, untitled: copy.untitled });
  const shown = broadcastRows(inbox.items, { filter, person, untitled: copy.untitled, query: q });
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.item.conversationId));

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    const body = text.trim();
    if (!body || picked.size === 0 || sending) return;
    try {
      const ids = await send([...picked], body);
      const outcome = broadcastOutcome(ids.length, picked.size, copy);
      toast.show({ title: outcome.title, variant: outcome.partial ? "default" : "success" });
      onSent?.(ids.length, picked.size);
      setText("");
      setPicked(new Set());
      onOpenChange(false);
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : copy.actionFailed, variant: "destructive" });
    }
  };

  const count = picked.size === 0 ? copy.broadcastPickSome : picked.size === 1 ? copy.broadcastPickedOne : fill(copy.broadcastPicked, { count: picked.size });
  return (
    <NativeSheet open={open} onOpenChange={onOpenChange} snapPoints={["90%"]} testID={testID}>
      <NativeSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
        <NativeText preset="h4" accessibilityRole="header">
          {copy.broadcastTitle}
        </NativeText>
        <NativeInlineAlert variant="info" description={copy.broadcastExplainer} testID={`${testID}-explainer`} />
        <NativeTextarea
          testID={`${testID}-text`}
          label={copy.broadcastMessage}
          accessibilityLabel={copy.broadcastMessage}
          value={text}
          onChangeText={setText}
          maxLength={CHAT_LIMITS.bodyChars}
          placeholder={copy.broadcastPlaceholder}
          rows={4}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <NativeText preset="label" accessibilityRole="header">
            {copy.broadcastTo}
          </NativeText>
          <NativeButton
            testID={`${testID}-all`}
            variant="ghost"
            size="sm"
            disabled={shown.length === 0}
            onPress={() =>
              setPicked((p) => {
                const next = new Set(p);
                for (const r of shown) {
                  if (allShown) next.delete(r.item.conversationId);
                  else next.add(r.item.conversationId);
                }
                return next;
              })
            }
          >
            {allShown ? copy.broadcastClear : copy.broadcastSelectAll}
          </NativeButton>
        </View>
        <NativeSearchBar testID={`${testID}-filter`} value={q} onChange={setQ} placeholder={copy.broadcastFilter} showCancel={false} />
        {inbox.isLoading ? (
          <View testID={`${testID}-loading`} style={{ gap: 8 }}>
            <NativeSkeleton height={44} className="w-full" />
            <NativeSkeleton height={44} className="w-full" />
          </View>
        ) : shown.length === 0 ? (
          <NativeEmptyState variant="no-results" title={all.length ? copy.broadcastNoMatches : copy.broadcastNoConversations} testID={`${testID}-empty`} />
        ) : (
          <View testID={`${testID}-list`} style={{ borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface }}>
            {shown.map(({ item, title, avatarUrl }) => {
              const on = picked.has(item.conversationId);
              return (
                <Pressable
                  key={item.conversationId}
                  testID={`${testID}-row-${item.conversationId}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={title}
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(item.conversationId)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <NativeCheckbox checked={on} />
                  </View>
                  <NativeAvatar size={32} src={avatarUrl} fallback={initials(title)} alt={title} recyclingKey={item.conversationId} />
                  <NativeText preset="body" numberOfLines={1} style={{ flex: 1 }}>
                    {title}
                  </NativeText>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 4 }}>
          <NativeText testID={`${testID}-count`} preset="body-sm" accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.secondaryLabel }}>
            {count}
          </NativeText>
          <NativeButton testID={`${testID}-send`} onPress={() => void submit()} loading={sending} disabled={!text.trim() || picked.size === 0}>
            {picked.size > 1 ? fill(copy.broadcastSendTo, { count: picked.size }) : copy.broadcastSend}
          </NativeButton>
        </View>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

