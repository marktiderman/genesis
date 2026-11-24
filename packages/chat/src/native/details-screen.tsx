/**
 * @feat:chat
 * A conversation's details, as Messages draws a contact's: a large face and the name (the
 * conversation with yourself shows your own face and "Just you"), round glass buttons (Search,
 * Pin, Scheduled), then grouped cards: Hide Alerts, a group's members, and Archive in red (Move to
 * Inbox once archived). Pin, Hide Alerts and Archive are the inbox's own actions
 * (`useInboxActions`); nothing new on the server.
 *
 * The screen sets a transparent stack header with the back button alone and hides the tab bar
 * (`nativeHeader`, default true). Every section is a slot: `hero`, `actions`, `settings`,
 * `members` and `danger`.
 */
import { useCallback, useMemo, type ReactNode } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { NativeSwitch, NativeText, useGenesisModules } from "@marktiderman/genesis-ui-native/components";
import { composeHeaderOptions, useHideTabBar } from "@marktiderman/genesis-ui-native/layouts";
import type { ChatConversation, ChatInboxItem, ChatMember } from "../core/types";
import { chatKeys, useChat, useInbox, useInboxActions, usePeople, usePerson } from "../react/index";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { CHAT_METRICS, ChatFace, ChatGlassCircle, ChatSymbol, ChatTap, useChatColors } from "./messages-look";

/** What every section of the details is given. */
export interface ChatDetailsContext {
  conversationId: string;
  conversation: ChatConversation | null;
  /** Its inbox row (pinned, muted, archived), once read. */
  item: ChatInboxItem | null;
  /** Everyone who can post, you included. */
  members: ChatMember[];
  title: string;
  subtitle: string | null;
  /** The conversation with yourself. */
  self: boolean;
  avatarUrl: string | null;
  testID: string;
}

/** The parts `slots` and `slotProps` reach; each receives the context. */
export type ChatDetailsSlotMap = {
  hero: ChatDetailsContext;
  actions: ChatDetailsContext & { onSearch?: () => void; onOpenScheduled?: () => void };
  settings: ChatDetailsContext;
  members: ChatDetailsContext;
  danger: ChatDetailsContext & { onArchived?: () => void };
};

export interface ChatDetailsScreenProps {
  conversationId: string;
  /** Search in this conversation (`ChatSearchScreen` with its id): the Search button. */
  onSearch?: () => void;
  /** This conversation's scheduled messages: the Scheduled button. */
  onOpenScheduled?: () => void;
  /** After Archive (go back to the inbox). */
  onArchived?: () => void;
  /** Under the name, instead of "Just you" or the member count. */
  subtitle?: string | null;
  /** Sets a transparent stack header and hides the tab bar. Default true. */
  nativeHeader?: boolean;
  slots?: Slots<ChatDetailsSlotMap>;
  slotProps?: SlotPropsFor<ChatDetailsSlotMap>;
  testID?: string;
}

/** The conversation with yourself: direct, and you its only member who posts. */
export function isSelfMembers(conversation: Pick<ChatConversation, "kind"> | null | undefined, memberIds: readonly string[], me: string | null | undefined): boolean {
  if (!conversation || conversation.kind !== "direct" || !me || !memberIds.length) return false;
  return memberIds.every((id) => id === me);
}

const NO_SLOTS: Slots<ChatDetailsSlotMap> = Object.freeze({});
const NO_SLOT_PROPS: SlotPropsFor<ChatDetailsSlotMap> = Object.freeze({});

export function ChatDetailsScreen({ conversationId, onSearch, onOpenScheduled, onArchived, subtitle: subtitleProp, nativeHeader = true, slots = NO_SLOTS, slotProps = NO_SLOT_PROPS, testID = "chat-details" }: ChatDetailsScreenProps) {
  const { client, userId } = useChat();
  const { copy, person: known } = useChatNative();
  const c = useChatColors();
  const hasRouter = Boolean(useGenesisModules().router?.StackScreen);
  const conversation = useQuery({ queryKey: chatKeys.conversation(conversationId), queryFn: () => client.conversation(conversationId), enabled: Boolean(conversationId) }).data ?? null;
  const loaded = useQuery({ queryKey: chatKeys.members(conversationId), queryFn: () => client.members(conversationId), enabled: Boolean(conversationId), staleTime: 60_000 }).data;
  const posters = useMemo(() => (loaded ?? []).filter((m) => m.role !== "observer"), [loaded]);
  const inbox = useInbox({});
  const archivedInbox = useInbox({ archived: true });
  const item = inbox.items.find((i) => i.conversationId === conversationId) ?? archivedInbox.items.find((i) => i.conversationId === conversationId) ?? null;
  const self = isSelfMembers(conversation, posters.map((m) => m.userId), userId);
  const other = conversation?.title ? null : (posters.find((m) => m.userId !== userId)?.userId ?? null);
  const fetched = usePerson(self ? userId : other);
  const person = (self ? known(userId) : known(other)) ?? fetched ?? undefined;
  const title = conversation?.title ?? person?.name ?? copy.untitled;
  const subtitle =
    subtitleProp !== undefined ? subtitleProp : self ? copy.justYou : conversation?.title && loaded ? (posters.length === 1 ? copy.membersOne : fill(copy.members, { count: posters.length })) : null;
  const ctx: ChatDetailsContext = { conversationId, conversation, item, members: posters, title, subtitle, self, avatarUrl: person?.avatarUrl ?? null, testID };

  return (
    <>
      <ScrollView testID={testID} style={{ flex: 1, backgroundColor: c.roles.page }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 48 }}>
        {renderSlot(ChatDetailsHero, slots.hero, ctx, slotProps.hero)}
        {renderSlot(ChatDetailsActions, slots.actions, { ...ctx, onSearch, onOpenScheduled }, slotProps.actions)}
        {renderSlot(ChatDetailsSettings, slots.settings, ctx, slotProps.settings)}
        {renderSlot(ChatDetailsMembers, slots.members, ctx, slotProps.members)}
        {renderSlot(ChatDetailsDanger, slots.danger, { ...ctx, onArchived }, slotProps.danger)}
      </ScrollView>
      {nativeHeader && hasRouter ? <DetailsChrome /> : null}
    </>
  );
}

function DetailsChrome() {
  const { router } = useGenesisModules();
  useHideTabBar(true);
  const options = useMemo(() => composeHeaderOptions({ headerTitle: "", large: false, headerOptions: { headerTransparent: true, headerShadowVisible: false, headerBackButtonDisplayMode: "minimal" } }), []);
  const StackScreen = router?.StackScreen;
  return StackScreen ? <StackScreen options={options} /> : null;
}

/** The large face, the name and what's under it. */
export function ChatDetailsHero({ title, subtitle, self, avatarUrl, testID }: ChatDetailsSlotMap["hero"]) {
  const c = useChatColors();
  return (
    <View style={{ alignItems: "center", paddingTop: 4 }}>
      <ChatFace name={self ? null : title} src={avatarUrl} size={CHAT_METRICS.detailsAvatar} testID={`${testID}-avatar`} />
      <NativeText accessibilityRole="header" numberOfLines={2} style={{ marginTop: 10, fontSize: 28, lineHeight: 34, fontWeight: "700", color: c.label, textAlign: "center", paddingHorizontal: 24 }}>
        {title}
      </NativeText>
      {subtitle ? <NativeText style={{ marginTop: 2, fontSize: 15, lineHeight: 20, color: c.secondaryLabel }}>{subtitle}</NativeText> : null}
    </View>
  );
}

/** The round glass buttons: Search, Pin or Unpin, Scheduled. */
export function ChatDetailsActions({ item, onSearch, onOpenScheduled, testID }: ChatDetailsSlotMap["actions"]) {
  const c = useChatColors();
  const { copy } = useChatNative();
  const act = useInboxActions();
  const fail = useFailed();
  const size = CHAT_METRICS.detailsButton;
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 16 }}>
      {onSearch ? (
        <ChatGlassCircle size={size} testID={`${testID}-search`} label={copy.searchInConversation} onPress={onSearch}>
          <ChatSymbol icon="search" sf="magnifyingglass" size={19} color={c.label} />
        </ChatGlassCircle>
      ) : null}
      {item ? (
        <ChatGlassCircle size={size} testID={`${testID}-pin`} label={item.pinned ? copy.unpin : copy.pin} onPress={() => void act.togglePinned(item).catch(fail)}>
          <ChatSymbol icon={item.pinned ? "pin-off" : "pin"} sf={item.pinned ? "pin.slash.fill" : "pin.fill"} size={19} color={c.label} />
        </ChatGlassCircle>
      ) : null}
      {onOpenScheduled ? (
        <ChatGlassCircle size={size} testID={`${testID}-scheduled`} label={copy.scheduledMessages} onPress={onOpenScheduled}>
          <ChatSymbol icon="clock" sf="clock" size={19} color={c.label} />
        </ChatGlassCircle>
      ) : null}
    </View>
  );
}

/** Hide Alerts, as a switch. */
export function ChatDetailsSettings({ item, testID }: ChatDetailsSlotMap["settings"]) {
  const { copy } = useChatNative();
  const act = useInboxActions();
  const fail = useFailed();
  if (!item) return null;
  return (
    <Card>
      <DetailsRow title={copy.hideAlerts} testID={`${testID}-mute`} trailing={<NativeSwitch checked={item.muted} onCheckedChange={() => void act.toggleMuted(item).catch(fail)} />} />
    </Card>
  );
}

/** A group's members (up to 50), with Admin beside an owner or admin. */
export function ChatDetailsMembers({ conversation, members, testID }: ChatDetailsSlotMap["members"]) {
  const { userId } = useChat();
  const { copy, person } = useChatNative();
  const others = members.filter((m) => m.userId !== userId);
  const people = usePeople(others.map((m) => m.userId));
  if (!conversation?.title || !others.length) return null;
  return (
    <Card>
      {others.slice(0, 50).map((m, i) => {
        const p = person(m.userId) ?? people[m.userId];
        const name = p?.name ?? copy.member;
        return (
          <View key={m.userId}>
            {i ? <Divider inset={62} /> : null}
            <DetailsRow testID={`${testID}-member-${m.userId}`} title={name} subtitle={m.role === "owner" || m.role === "admin" ? copy.admin : undefined} leading={<ChatFace name={name} src={p?.avatarUrl ?? null} size={32} />} />
          </View>
        );
      })}
    </Card>
  );
}

/** Archive Conversation in red, or Move to Inbox once archived. */
export function ChatDetailsDanger({ item, onArchived, testID }: ChatDetailsSlotMap["danger"]) {
  const c = useChatColors();
  const { copy } = useChatNative();
  const act = useInboxActions();
  const fail = useFailed();
  if (!item) return null;
  return (
    <Card>
      {item.archived ? (
        <DetailsRow title={copy.moveToInbox} tint={c.roles.sent} testID={`${testID}-unarchive`} onPress={() => void act.setArchived(item, false).catch(fail)} />
      ) : (
        <DetailsRow
          title={copy.archiveConversation}
          tint={c.destructive}
          testID={`${testID}-archive`}
          onPress={() => {
            void act.setArchived(item, true).then(() => onArchived?.(), fail);
          }}
        />
      )}
    </Card>
  );
}

function useFailed() {
  const { copy } = useChatNative();
  return useCallback((e: unknown) => Alert.alert(copy.settingsFailed, e instanceof Error ? e.message : undefined), [copy.settingsFailed]);
}

function Card({ children }: { children: ReactNode }) {
  const c = useChatColors();
  return <View style={{ backgroundColor: c.roles.card, borderRadius: CHAT_METRICS.cardRadius, overflow: "hidden", marginHorizontal: CHAT_METRICS.margin, marginTop: 16 }}>{children}</View>;
}

function Divider({ inset = 18 }: { inset?: number }) {
  const c = useChatColors();
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: c.separator }} />;
}

function DetailsRow({ title, subtitle, leading, trailing, onPress, tint, testID }: { title: string; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; onPress?: () => void; tint?: unknown; testID?: string }) {
  const c = useChatColors();
  return (
    <ChatTap
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(", ")}
      look={(pressed) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: pressed && onPress ? c.roles.pressed : undefined })}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <NativeText style={{ fontSize: 17, lineHeight: 22, color: (tint as string | undefined) ?? c.label }}>{title}</NativeText>
        {subtitle ? <NativeText style={{ fontSize: 13, lineHeight: 18, color: c.secondaryLabel }}>{subtitle}</NativeText> : null}
      </View>
      {trailing}
    </ChatTap>
  );
}
