/**
 * @feat:chat
 * Messages' bubble shape on its own (`ChatBubbleShape`: sent in the chat role `sent` with white
 * words, received in `received`, round on every corner, a tail on the last of a run), and what a
 * long press on an inbox row shows: the conversation's latest messages on a rounded card, as
 * Messages' peek does (`ChatConversationPreview`). Reading the peek marks nothing read.
 */
import { useMemo, type ReactNode } from "react";
import { ScrollView, View, type DimensionValue } from "react-native";
import { NativeText } from "@marktiderman/genesis-ui-native/components";
import { useChat, useConversation } from "../react/index";
import { attachmentPreview } from "./attachment-cards";
import { useChatNative } from "./context";
import { displayBody, type BubblePosition } from "./message-bubble";
import { CHAT_METRICS, useChatColors } from "./messages-look";
import { timeSeparatorLabel } from "./messages-time";

export interface ChatBubbleShapeProps {
  mine: boolean;
  position: BubblePosition;
  children: ReactNode;
  maxWidth?: DimensionValue;
  /** False for a photo that fills the bubble. */
  padded?: boolean;
  /** A message still sending. */
  faded?: boolean;
  testID?: string;
}

/** The bubble, drawn alone (the long-press preview, the inbox's peek). */
export function ChatBubbleShape({ mine, position, children, maxWidth = CHAT_METRICS.bubbleMaxWidth, padded = true, faded = false, testID }: ChatBubbleShapeProps) {
  const c = useChatColors();
  const color = mine ? c.roles.sent : c.roles.received;
  const tail = position === "single" || position === "last";
  return (
    <View testID={testID} style={{ maxWidth, opacity: faded ? 0.6 : 1 }}>
      <View
        style={{
          backgroundColor: color,
          borderRadius: CHAT_METRICS.bubbleRadius,
          paddingHorizontal: padded ? CHAT_METRICS.bubblePadH : 0,
          paddingVertical: padded ? CHAT_METRICS.bubblePadV : 0,
          overflow: padded ? "visible" : "hidden",
        }}
      >
        {children}
      </View>
      {tail ? <ChatBubbleTail mine={mine} color={color} /> : null}
    </View>
  );
}

/** The tail: a piece of the bubble's color at its bottom corner, its inner curve cut by the page. */
export function ChatBubbleTail({ mine, color, testID }: { mine: boolean; color: unknown; testID?: string }) {
  const c = useChatColors();
  const side = mine ? "right" : "left";
  const inner = mine ? "borderBottomLeftRadius" : "borderBottomRightRadius";
  return (
    <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", bottom: 0, [side]: -6, width: 20, height: 18 }}>
      <View style={{ position: "absolute", bottom: 0, [side]: 0, width: 20, height: 18, backgroundColor: color as string, [inner]: 16 }} />
      <View style={{ position: "absolute", bottom: 0, [side]: -6, width: 12, height: 20, backgroundColor: c.roles.pageSolid, [inner]: 10 }} />
    </View>
  );
}

/** Where each of a list of messages sits in its run of one sender's (no more than an hour apart). */
export function runPositions(items: readonly { senderId: string | null; createdAt: string }[], gapMs = 60 * 60_000): BubblePosition[] {
  return items.map((m, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    const start = !prev || prev.senderId !== m.senderId || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > gapMs;
    const end = !next || next.senderId !== m.senderId || Date.parse(next.createdAt) - Date.parse(m.createdAt) > gapMs;
    return start && end ? "single" : start ? "first" : end ? "last" : "middle";
  });
}

export interface ChatConversationPreviewProps {
  conversationId: string;
  title: string;
  testID: string;
}

/** A conversation's latest messages, on a card: the inbox row's long-press peek. */
export function ChatConversationPreview({ conversationId, title, testID }: ChatConversationPreviewProps) {
  const c = useChatColors();
  const { copy } = useChatNative();
  const { userId, attachmentKinds } = useChat();
  const conv = useConversation(conversationId, { markRead: false });
  const messages = useMemo(() => conv.messages.filter((m) => m.kind !== "system").slice(-12), [conv.messages]);
  const positions = useMemo(() => runPositions(messages), [messages]);
  const first = messages[0] ? timeSeparatorLabel(messages[0].createdAt) : null;
  return (
    <View testID={testID} accessible accessibilityLabel={title} style={{ flex: 1, borderRadius: 30, overflow: "hidden", backgroundColor: c.roles.page }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", padding: 12, paddingBottom: 16 }} scrollEnabled={false}>
        {first ? (
          <NativeText style={{ textAlign: "center", fontSize: 11, lineHeight: 13, color: c.secondaryLabel, marginBottom: 8 }}>
            <NativeText style={{ fontSize: 11, lineHeight: 13, fontWeight: "600", color: c.secondaryLabel }}>{first.day}</NativeText> {first.time}
          </NativeText>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.senderId === userId;
          const position = positions[i]!;
          const text = m.deletedAt ? copy.deleted : displayBody(m.body) || attachmentPreview("", m.attachments[0], attachmentKinds, false);
          return (
            <View key={m.id} style={{ marginTop: position === "single" || position === "first" ? (i === 0 ? 0 : CHAT_METRICS.runGap) : CHAT_METRICS.bubbleGap, alignItems: mine ? "flex-end" : "flex-start" }}>
              <ChatBubbleShape mine={mine} position={position} maxWidth="78%">
                <NativeText style={{ fontSize: 15, lineHeight: 20, color: mine ? c.roles.onSent : c.roles.onReceived }}>{text}</NativeText>
              </ChatBubbleShape>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
