/**
 * @feat:chat
 * The long-press sheet: a row of quick reactions and "+" for every emoji
 * (the picker takes the sheet's place), then Reply, Copy, Pin or
 * Unpin, and Delete (confirmed), offered per `messageActionsFor`. Each runs
 * through `useMessageActions`; a refusal from the server is a toast.
 */
import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { NativeIcon, NativeListItem, NativeSheet, NativeText, type NativeIconName } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { summarizeReactions } from "../core/thread";
import type { ChatAttachmentKind } from "../react/index";
import { messagePreview } from "./attachment-cards";
import type { ChatMessage } from "../core/types";
import { QUICK_REACTIONS, canReactTo, messageActionsFor, type MessageActionContext, type MessageActionId } from "./actions";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { ChatEmojiPicker } from "./emoji-picker";

export interface MessageActionsSheetProps {
  message: ChatMessage | null;
  context: MessageActionContext;
  onClose: () => void;
  onReact: (message: ChatMessage, emoji: string, on: boolean) => void;
  onAction: (message: ChatMessage, action: MessageActionId) => void;
  /** The app's attachment kinds (`ChatProvider attachmentKinds`): the caption names a card by its title. */
  attachmentKinds?: Record<string, ChatAttachmentKind>;
  testID?: string;
}

const ICONS: Record<MessageActionId, NativeIconName> = { reply: "reply", copy: "copy", pin: "pin", unpin: "pin", delete: "trash" };

export function MessageActionsSheet({ message, context, onClose, onReact, onAction, attachmentKinds, testID = "chat-message-actions" }: MessageActionsSheetProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const actions = message ? messageActionsFor(message, context) : [];
  const mineReactions = new Set(message ? summarizeReactions(message, context.me).filter((r) => r.mine).map((r) => r.emoji) : []);
  const labels: Record<MessageActionId, string> = { reply: copy.reply, copy: copy.copy, pin: copy.pin, unpin: copy.unpin, delete: copy.delete };
  // "+" swaps the sheet's content for the full picker (iOS can't present a second sheet over this one).
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!message) setPicking(false);
  }, [message]);

  const run = (action: MessageActionId) => {
    if (!message) return;
    if (action === "delete") {
      Alert.alert(copy.deleteConfirm, undefined, [
        { text: copy.delete, style: "destructive", onPress: () => onAction(message, "delete") },
        { text: copy.cancel, style: "cancel" },
      ]);
      onClose();
      return;
    }
    onClose();
    onAction(message, action);
  };

  return (
    <NativeSheet open={message !== null} onOpenChange={(open) => (open ? undefined : onClose())} testID={testID}>
      {message && picking ? (
        <View style={{ paddingHorizontal: 16 }}>
        <ChatEmojiPicker
          userId={context.me}
          testID={`${testID}-picker`}
          onSelect={(emoji) => {
            onClose();
            onReact(message, emoji, !mineReactions.has(emoji));
          }}
        />
        </View>
      ) : message ? (
        // Room at the top: the iOS page sheet has no grabber, and its rounded corner clipped the caption.
        <View style={{ gap: 12, paddingTop: 20, paddingBottom: 8, paddingHorizontal: 16 }}>
          <NativeText testID={`${testID}-caption`} numberOfLines={2} preset="body-sm" style={{ color: colors.secondaryLabel, paddingHorizontal: 4 }}>
            {messagePreview(message, attachmentKinds)}
          </NativeText>
          {canReactTo(message, context) ? (
            <View accessibilityRole="toolbar" style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {QUICK_REACTIONS.map((emoji) => {
                const on = mineReactions.has(emoji);
                return (
                  <Pressable
                    key={emoji}
                    testID={`${testID}-react-${emoji}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={fill(copy.react, { emoji })}
                    onPress={() => {
                      onClose();
                      onReact(message, emoji, !on);
                    }}
                    style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.fill : undefined }}
                  >
                    <NativeText style={{ fontSize: 26, lineHeight: 34 }}>{emoji}</NativeText>
                  </Pressable>
                );
              })}
              <Pressable
                testID={`${testID}-react-more`}
                accessibilityRole="button"
                accessibilityLabel={copy.moreReactions}
                onPress={() => setPicking(true)}
                style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.fill }}
              >
                <NativeIcon name="plus" size={22} color={colors.secondaryLabel} />
              </Pressable>
            </View>
          ) : null}
          <View>
            {actions.map((action) => (
              <NativeListItem
                key={action}
                testID={`${testID}-${action}`}
                title={labels[action]}
                leading={<NativeIcon name={ICONS[action]} size={20} color={action === "delete" ? colors.destructive : colors.label} />}
                onPress={() => run(action)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </NativeSheet>
  );
}
