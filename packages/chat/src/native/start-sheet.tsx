/**
 * @feat:chat
 * Starting a conversation: a header button, and a sheet listing the people
 * the app says you may message (its own query; the kind's start check decides
 * on the server). Picking someone starts the conversation, or finds the one
 * you already have, and opens it.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { NativeAvatar, NativeIcon, NativeListItem, NativeSheet, NativeSheetScrollView, NativeText, useToast } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { useStartConversation } from "../react/index";
import { initials, useChatNative } from "./context";

export interface ChatStartPerson {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  /** A second line ("Coach", "Team"). */
  subtitle?: string;
}

export interface ChatStartSheetProps {
  open: boolean;
  onClose: () => void;
  people: ChatStartPerson[];
  /** Default `direct`. */
  kind?: string;
  onStarted: (conversationId: string) => void;
  testID?: string;
}

export function ChatStartSheet({ open, onClose, people, kind = "direct", onStarted, testID = "chat-start" }: ChatStartSheetProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const start = useStartConversation();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (person: ChatStartPerson) => {
    if (busy) return;
    setBusy(person.userId);
    try {
      const id = await start(kind, [person.userId]);
      onClose();
      onStarted(id);
    } catch {
      toast.show({ title: copy.actionFailed, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <NativeSheet open={open} onOpenChange={(o) => (o ? undefined : onClose())} testID={testID}>
      <NativeText preset="h4" accessibilityRole="header" style={{ paddingHorizontal: 4, paddingBottom: 8, color: colors.label }}>
        {copy.startConversationTitle}
      </NativeText>
      <NativeSheetScrollView>
        <View>
          {people.map((p) => (
            <NativeListItem
              key={p.userId}
              testID={`${testID}-person-${p.userId}`}
              title={p.name}
              subtitle={p.subtitle}
              leading={<NativeAvatar size={36} src={p.avatarUrl ?? null} fallback={initials(p.name)} alt={p.name} />}
              disabled={busy !== null}
              onPress={() => void pick(p)}
            />
          ))}
        </View>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

/** A 44pt compose button for the inbox's header (`headerRight`). */
export function ChatStartButton({ onPress, testID = "chat-start-button" }: { onPress: () => void; testID?: string }) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={copy.startConversation} onPress={onPress} hitSlop={6} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <NativeIcon name="compose" size={22} color={colors.tint} />
    </Pressable>
  );
}
