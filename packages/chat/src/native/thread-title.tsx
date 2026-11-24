/**
 * @feat:chat
 * The thread's title in the navigation bar, as Messages draws it: who it is (an avatar over or
 * beside the name), a quiet line under it (the away line by default), and, with `onPress`, a
 * button that opens their details. `useChatThreadStackOptions` puts it in `headerTitle` when any
 * of `avatar`, `subtitle`, `onPressTitle` or `conversationId` is given.
 *
 * The default subtitle (the away line) needs `ChatProvider` above the navigator, since the bar is
 * drawn by the navigator, not the screen. Pass `subtitle` yourself (or `null` for none) otherwise.
 */
import { isValidElement, useCallback, useMemo, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { NativeAvatar, NativeText } from "@marktiderman/genesis-ui-native/components";
import { ChatFace, ChatGlassPanel, ChatSymbol, ChatTap, useChatColors } from "./messages-look";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import type { ChatMember } from "../core/types";
import { chatKeys, useChat } from "../react/index";
import { useAwayLine } from "./availability";
import { initials, useChatNative } from "./context";

/** Who the conversation is with, for the title's avatar. */
export interface ChatThreadTitleAvatar {
  src?: string | null;
  name?: string | null;
  /** Keeps the picture when the bar redraws (expo-image's `recyclingKey`). */
  id?: string;
}

export interface ChatThreadTitleProps {
  title: string;
  /** Under the title. `undefined`: the away line, from `conversationId`. `null`: none. */
  subtitle?: string | null;
  /** A picture beside the title: who it is, or your own element. */
  avatar?: ChatThreadTitleAvatar | ReactNode;
  /** Makes the title a button (to the conversation's details). */
  onPress?: () => void;
  /** VoiceOver's hint when it is a button. */
  pressHint?: string;
  /** For the default subtitle (the away line). */
  conversationId?: string;
  tintColor?: string;
  /**
   * `"stacked"` (the default): Messages' header, the face centred over a glass pill with the name
   * (and a chevron when it opens the details); the subtitle is read, not drawn. `"inline"`: the
   * picture beside the name, the subtitle under it.
   */
  layout?: "stacked" | "inline";
  /** The stacked face's size, in points. Default 30, which fits the bar; Messages draws 50 in a taller bar. */
  faceSize?: number;
  testID?: string;
}

/**
 * A plain object is avatar data (`{}` and `{ id }` included). Anything React renders stays the app's
 * own node: an element, a portal, an array, a Set or any other iterable of nodes.
 */
function isAvatarData(a: unknown): a is ChatThreadTitleAvatar {
  if (a === null || typeof a !== "object" || isValidElement(a)) return false;
  if ("$$typeof" in a) return false;
  return typeof (a as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function";
}

export function ChatThreadTitle({ title, subtitle, avatar, onPress, pressHint, conversationId, tintColor, layout, faceSize, testID = "chat-thread-title" }: ChatThreadTitleProps) {
  if (subtitle === undefined && conversationId) {
    return <AwayTitle conversationId={conversationId} title={title} avatar={avatar} onPress={onPress} pressHint={pressHint} tintColor={tintColor} layout={layout} faceSize={faceSize} testID={testID} />;
  }
  return <TitleBody title={title} subtitle={subtitle ?? null} avatar={avatar} onPress={onPress} pressHint={pressHint} tintColor={tintColor} layout={layout} faceSize={faceSize} testID={testID} />;
}

function AwayTitle({ conversationId, ...rest }: Omit<ChatThreadTitleProps, "subtitle"> & { conversationId: string; testID: string }) {
  const { client, userId } = useChat();
  const { person, copy } = useChatNative();
  // The thread's own members query (the same key), so this reads its cache.
  const members = useQuery<ChatMember[]>({ queryKey: chatKeys.members(conversationId), queryFn: () => client.members(conversationId), staleTime: 60_000 }).data;
  const nameOf = useCallback((id: string) => person(id)?.name ?? copy.someone, [person, copy.someone]);
  const away = useAwayLine(conversationId, useMemo(() => members ?? [], [members]), userId, nameOf);
  return <TitleBody {...rest} subtitle={away} />;
}

function TitleBody(props: Omit<ChatThreadTitleProps, "subtitle" | "conversationId"> & { subtitle: string | null; testID: string }) {
  if ((props.layout ?? "stacked") === "stacked") return <StackedTitle {...props} />;
  return <InlineTitle {...props} />;
}

/** Messages' header: the face over a glass pill with the name and a chevron. */
function StackedTitle({ title, subtitle, avatar, onPress, pressHint, faceSize = 30, testID }: Omit<ChatThreadTitleProps, "subtitle" | "conversationId"> & { subtitle: string | null; testID: string }) {
  const c = useChatColors();
  const face = isAvatarData(avatar) ? (
    <ChatFace size={faceSize} name={avatar.name === null ? null : (avatar.name ?? title)} src={avatar.src ?? null} recyclingKey={avatar.id} />
  ) : avatar === undefined ? (
    <ChatFace size={faceSize} name={title} />
  ) : (
    ((avatar as ReactNode) ?? null)
  );
  const label = [title, subtitle].filter(Boolean).join(", ");
  const pillHeight = Math.max(20, Math.round(faceSize * 0.64));
  const body = (
    <View style={{ alignItems: "center", maxWidth: 260 }}>
      {face ? (
        <View testID={`${testID}-avatar`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {face}
        </View>
      ) : null}
      <View style={{ marginTop: 2 }}>
        <ChatGlassPanel radius={pillHeight / 2}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 10, paddingRight: onPress ? 8 : 10, height: pillHeight, maxWidth: 240 }}>
            <NativeText numberOfLines={1} style={{ fontSize: pillHeight > 26 ? 15 : 13, fontWeight: "600", color: c.label, flexShrink: 1 }}>
              {title || " "}
            </NativeText>
            {onPress ? <ChatSymbol icon="chevron-right" sf="chevron.forward" size={9} weight="bold" color={c.secondaryLabel} /> : null}
          </View>
        </ChatGlassPanel>
      </View>
    </View>
  );
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityRole="header" accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <ChatTap testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={pressHint} onPress={onPress} hitSlop={4} look={(pressed) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </ChatTap>
  );
}

function InlineTitle({ title, subtitle, avatar, onPress, pressHint, tintColor, testID }: Omit<ChatThreadTitleProps, "subtitle" | "conversationId"> & { subtitle: string | null; testID: string }) {
  const colors = useThemeRoles();
  const picture = isAvatarData(avatar) ? (
    <NativeAvatar size={28} src={avatar.src ?? null} fallback={initials(avatar.name ?? title)} alt={avatar.name ?? title} recyclingKey={avatar.id} />
  ) : (
    (avatar as ReactNode) ?? null
  );
  const label = [title, subtitle].filter(Boolean).join(", ");
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 260 }}>
      {picture ? (
        <View testID={`${testID}-avatar`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {picture}
        </View>
      ) : null}
      <View style={{ flexShrink: 1, alignItems: picture ? "flex-start" : "center" }}>
        <NativeText numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: "600", color: tintColor ?? colors.label }}>
          {title}
        </NativeText>
        {subtitle ? (
          <NativeText testID={`${testID}-subtitle`} numberOfLines={1} preset="caption" style={{ color: colors.secondaryLabel }}>
            {subtitle}
          </NativeText>
        ) : null}
      </View>
    </View>
  );
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityRole="header" accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={pressHint} onPress={onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
      {body}
    </Pressable>
  );
}
