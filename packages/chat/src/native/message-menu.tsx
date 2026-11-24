/**
 * @feat:chat
 * A long press on a bubble, as Messages shows it: the bubble lifts where it is over the softened
 * thread, the tapbacks sit above it in a glass capsule (heart, thumbs up and down, haha, !!, ? and
 * a face for any emoji), and the glass menu opens below (Reply, Copy, Pin or Unpin, Delete, as
 * `messageActionsFor` allows). Delete asks first. A tapback taps the haptic and closes. The
 * `MessageActionsSheet` it replaces stays exported for a screen of an app's own.
 */
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { NativeText, type NativeIconName } from "@marktiderman/genesis-ui-native/components";
import { summarizeReactions } from "../core/thread";
import type { ChatMessage } from "../core/types";
import type { ChatAttachmentKind } from "../react/index";
import { canReactTo, messageActionsFor, type MessageActionContext, type MessageActionId } from "./actions";
import { messagePreview } from "./attachment-cards";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { ChatEmojiPickerSheet } from "./emoji-picker";
import { displayBody } from "./message-bubble";
import { ChatBubbleShape } from "./conversation-preview";
import { ChatContextOverlay, ChatGlassPanel, ChatSymbol, ChatTap, useChatColors, useChatFeel, type ChatMenuItem, type ChatRect } from "./messages-look";

/** Messages' six tapbacks. */
export const TAPBACKS = ["❤️", "👍", "👎", "😂", "‼️", "❓"] as const;

const ICON: Record<MessageActionId, { icon: NativeIconName; sf: string }> = {
  reply: { icon: "reply", sf: "arrowshape.turn.up.left" },
  copy: { icon: "copy", sf: "doc.on.doc" },
  pin: { icon: "pin", sf: "pin" },
  unpin: { icon: "pin-off", sf: "pin.slash" },
  delete: { icon: "trash", sf: "trash" },
};

export interface ChatMessageMenuProps {
  /** The message held, and where its bubble is on the window. */
  target: { message: ChatMessage; rect: ChatRect | null } | null;
  context: MessageActionContext;
  onClose: () => void;
  onReact: (message: ChatMessage, emoji: string, on: boolean) => void;
  onAction: (message: ChatMessage, action: MessageActionId) => void;
  /** The app's attachment kinds: a card's preview names it by its title. */
  attachmentKinds?: Record<string, ChatAttachmentKind>;
  testID?: string;
}

export function ChatMessageMenu({ target, context, onClose, onReact, onAction, attachmentKinds, testID = "chat-message-menu" }: ChatMessageMenuProps) {
  const feel = useChatFeel();
  const c = useChatColors();
  const { copy } = useChatNative();
  const [pickerFor, setPickerFor] = useState<ChatMessage | null>(null);
  const message = target?.message ?? null;
  const mine = message?.senderId === context.me;
  const mineReactions = new Set(message ? summarizeReactions(message, context.me).filter((r) => r.mine).map((r) => r.emoji) : []);
  const labels: Record<MessageActionId, string> = { reply: copy.reply, copy: copy.copy, pin: copy.pin, unpin: copy.unpin, delete: copy.delete };

  const items: ChatMenuItem[] = message
    ? messageActionsFor(message, context).map((id) => ({
        id,
        label: labels[id],
        icon: ICON[id].icon,
        sf: ICON[id].sf,
        destructive: id === "delete",
        onPress: () =>
          id === "delete"
            ? Alert.alert(copy.deleteConfirm, undefined, [
                { text: copy.cancel, style: "cancel" },
                { text: copy.delete, style: "destructive", onPress: () => onAction(message, id) },
              ])
            : onAction(message, id),
      }))
    : [];

  const tapbacks =
    message && canReactTo(message, context) ? (
      <ChatGlassPanel radius={26} testID={`${testID}-tapbacks`}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, height: 52, gap: 2 }}
          // A frosted fill under the glass, so the capsule reads over the softened thread.
          style={{ maxWidth: 360, backgroundColor: c.roles.menu }}
        >
          {TAPBACKS.map((e) => {
            const on = mineReactions.has(e);
            return (
              <ChatTap
                key={e}
                testID={`${testID}-react-${e}`}
                accessibilityRole="button"
                accessibilityLabel={fill(copy.tapback, { emoji: e })}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  feel.select();
                  onReact(message, e, !on);
                  onClose();
                }}
                look={(pressed) => ({ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.roles.sent : pressed ? c.roles.pressed : undefined, transform: [{ scale: pressed ? 1.2 : 1 }] })}
              >
                <NativeText style={{ fontSize: 24, lineHeight: 30 }}>{e}</NativeText>
              </ChatTap>
            );
          })}
          <ChatTap
            testID={`${testID}-react-more`}
            accessibilityRole="button"
            accessibilityLabel={copy.moreReactions}
            onPress={() => {
              setPickerFor(message);
              onClose();
            }}
            look={(pressed) => ({ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.roles.pressed : undefined })}
          >
            <ChatSymbol icon="smile" sf="face.smiling" size={22} color={c.secondaryLabel} />
          </ChatTap>
        </ScrollView>
      </ChatGlassPanel>
    ) : null;

  const words = message ? displayBody(message.body) || messagePreview(message, attachmentKinds) : "";

  return (
    <>
      <ChatContextOverlay
        open={Boolean(target)}
        onClose={onClose}
        anchor={target?.rect ?? null}
        previewHeight={target?.rect ? undefined : 80}
        align={mine ? "trailing" : "leading"}
        above={tapbacks}
        closeLabel={copy.closeMenu}
        preview={
          message ? (
            <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
              <ChatBubbleShape mine={mine} position="single" maxWidth="100%">
                <NativeText style={{ fontSize: 17, lineHeight: 22, color: mine ? c.roles.onSent : c.roles.onReceived }}>{words || " "}</NativeText>
              </ChatBubbleShape>
            </View>
          ) : null
        }
        items={items}
        testID={testID}
      />
      <ChatEmojiPickerSheet
        open={Boolean(pickerFor)}
        onClose={() => setPickerFor(null)}
        onSelect={(emoji) => {
          if (pickerFor) onReact(pickerFor, emoji, true);
          setPickerFor(null);
        }}
        userId={context.me}
        testID={`${testID}-emoji`}
      />
    </>
  );
}
