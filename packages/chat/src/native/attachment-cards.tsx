/**
 * @feat:chat
 * Cards for the app's own attachment kinds (`ChatProvider attachmentKinds`: a form to fill, a
 * check-in to answer): an icon, the title and subtitle the kind gives, and one button. The
 * button runs the kind's `onPress`; else the app's `onOpenAttachment` (open the form in the
 * app's own screen); else its `href`, when it is https. The bubble offers the same button as
 * a VoiceOver action (`cardAction`), since an accessible bubble hides what is inside it.
 */
import { Linking, View } from "react-native";
import { NativeButton, NativeIcon, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import type { ChatAttachment, ChatMessage } from "../core/types";
import type { ChatAttachmentKind } from "../react/index";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { ON_TINT_FILL, ON_TINT_FILL_STRONG } from "./media-colors";

export type OpenAttachment = (attachment: ChatAttachment, message: ChatMessage) => void;

/** A message's attachments split into the app's cards and the rest (photos, voice, video, files). */
export function splitCardAttachments<T extends { kind: string }>(attachments: readonly T[], kinds: Record<string, ChatAttachmentKind> | undefined): { cards: T[]; rest: T[] } {
  if (!kinds) return { cards: [], rest: [...attachments] };
  const cards: T[] = [];
  const rest: T[] = [];
  for (const a of attachments) (Object.prototype.hasOwnProperty.call(kinds, a.kind) ? cards : rest).push(a);
  return { cards, rest };
}

/**
 * A link a card may open by itself: https only. A kind's href is often built from what another
 * person sent, so any other scheme (tel:, sms:, another app's links) goes through the app's own
 * `onOpenAttachment` or the kind's `onPress` instead.
 */
export function isOpenableHref(href: string | null | undefined): href is string {
  if (!href) return false;
  try {
    const u = new URL(href);
    return u.protocol === "https:" && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** What a card does: the kind's own handler, else the app's, else an https href; null without a button. */
export function cardAction(kind: ChatAttachmentKind | undefined, attachment: ChatAttachment, message: ChatMessage, onOpenAttachment?: OpenAttachment): { label: string; run: () => void } | null {
  let action: ReturnType<NonNullable<ChatAttachmentKind["action"]>> = null;
  try {
    action = kind?.action?.(attachment);
  } catch {
    return null;
  }
  if (!action?.label) return null;
  const href = isOpenableHref(action.href) ? action.href : null;
  const onPress = action.onPress;
  const run = onPress ? onPress : onOpenAttachment ? () => onOpenAttachment(attachment, message) : href ? () => void Linking.openURL(href).catch(() => undefined) : null;
  return run ? { label: action.label, run } : null;
}

export interface ChatAttachmentCardProps {
  attachment: ChatAttachment;
  message: ChatMessage;
  kind: ChatAttachmentKind;
  mine?: boolean;
  onOpenAttachment?: OpenAttachment;
  testID?: string;
}

export function ChatAttachmentCard({ attachment, message, kind, mine = false, onOpenAttachment, testID = "chat-attachment-card" }: ChatAttachmentCardProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  let title = "";
  let subtitle: string | null | undefined = null;
  try {
    title = kind.title(attachment);
    subtitle = kind.subtitle?.(attachment);
  } catch (e) {
    // An app's kind that throws shows as a plain card, and says so in development.
    if (typeof __DEV__ !== "undefined" && __DEV__) console.warn(`[genesis-chat] attachment kind "${attachment.kind}" threw:`, e);
  }
  title = title || attachment.name || attachment.kind;
  const action = cardAction(kind, attachment, message, onOpenAttachment);
  const fg = mine ? "text-primary-foreground" : undefined;
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, minWidth: 220, backgroundColor: mine ? ON_TINT_FILL : colors.groupedBackground }}
    >
      <View
        accessible
        accessibilityLabel={subtitle ? fill(copy.attachmentCard, { title, subtitle }) : title}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: mine ? ON_TINT_FILL_STRONG : colors.fill }}>
          <NativeIcon name="file" size={20} color={mine ? colors.surface : colors.tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeText numberOfLines={1} className={fg} style={mine ? { fontWeight: "600", fontSize: 15 } : { fontWeight: "600", fontSize: 15, color: colors.label }}>
            {title}
          </NativeText>
          {subtitle ? (
            <NativeText preset="caption" numberOfLines={1} className={fg} style={mine ? { opacity: 0.85 } : { color: colors.secondaryLabel }}>
              {subtitle}
            </NativeText>
          ) : null}
        </View>
      </View>
      {action ? (
        <NativeButton testID={`${testID}-action`} variant={mine ? "secondary" : "default"} onPress={action.run}>
          {action.label}
        </NativeButton>
      ) : null}
    </View>
  );
}

declare const __DEV__: boolean | undefined;
