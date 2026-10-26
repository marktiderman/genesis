/**
 * @feat:chat
 * What moderation said about a message, in its bubble. A hidden message reaches only its sender
 * and the conversation's observers: the sender sees it dimmed with "Hidden by moderation. Only
 * you can see it."; an observer sees a "Hidden by moderation" marker. A flagged message is seen
 * by everyone; observers see a quiet "Flagged" marker. The same rules as the web's bubble.
 */
import { View } from "react-native";
import { NativeIcon, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import type { ChatMessage } from "../core/types";
import { useChatNative } from "./context";

export type ModerationNote = "hidden-mine" | "hidden" | "flagged";

/** The note a bubble shows, or null. Deleted messages carry none. */
export function moderationNote(message: Pick<ChatMessage, "moderation" | "deletedAt"> | null | undefined, opts: { mine: boolean; observer: boolean }): ModerationNote | null {
  if (!message || message.deletedAt) return null;
  if (message.moderation === "hidden") return opts.mine && !opts.observer ? "hidden-mine" : "hidden";
  if (message.moderation === "flagged" && opts.observer) return "flagged";
  return null;
}

/** The note's words (for the bubble's accessibility label too). */
export function moderationText(note: ModerationNote, copy: { moderationHidden: string; moderationHiddenMine: string; moderationFlagged: string }): string {
  return note === "hidden-mine" ? copy.moderationHiddenMine : note === "hidden" ? copy.moderationHidden : copy.moderationFlagged;
}

export function ModerationMarker({ note, mine, testID }: { note: ModerationNote; mine: boolean; testID?: string }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const color = mine ? colors.surface : note === "flagged" ? colors.secondaryLabel : colors.destructive;
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <NativeIcon name={note === "flagged" ? "warning" : "lock"} size={12} color={color} />
      <NativeText preset="caption" style={{ color, fontWeight: "600", flexShrink: 1 }}>
        {moderationText(note, copy)}
      </NativeText>
    </View>
  );
}
