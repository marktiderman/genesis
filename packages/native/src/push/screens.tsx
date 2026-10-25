/**
 * The soft pre-prompt: the default of the `pushPrompt` slot, built from
 * `@marktiderman/genesis-ui-native`. It says what push is for before the
 * system asks, so a person who isn't ready says "Not now" here, where the
 * app can ask again later, rather than "Don't Allow" there, where it can't.
 */
import { View } from "react-native";
import { NativeButton, NativeSheet, NativeText } from "@marktiderman/genesis-ui-native/components";

export interface PushPromptProps {
  /** What `offer(reason)` said push is for here ("to hear when someone replies"), or null. */
  reason: string | null;
  /** "Turn on": shows the system prompt. */
  accept: () => void;
  /** "Not now": asks again after the cooldown, never more than `maxDeclines` times. */
  decline: () => void;
  title?: string;
  body?: string;
  acceptLabel?: string;
  declineLabel?: string;
}

export function PushPromptSheet({ reason, accept, decline, title, body, acceptLabel, declineLabel }: PushPromptProps) {
  return (
    <NativeSheet open onOpenChange={(open) => (open ? undefined : decline())} testID="genesis-push-prompt">
      <View className="gap-4 p-6">
        <NativeText preset="h3" accessibilityRole="header">
          {title ?? "Turn on notifications?"}
        </NativeText>
        <NativeText preset="body" className="text-muted-foreground" testID="genesis-push-prompt-body">
          {body ?? (reason ? `Get a notification ${reason}. You can change this any time in Settings.` : "Get a notification when something needs you. You can change this any time in Settings.")}
        </NativeText>
        <NativeButton onPress={accept} testID="genesis-push-prompt-accept">
          {acceptLabel ?? "Turn on"}
        </NativeButton>
        <NativeButton variant="ghost" onPress={decline} testID="genesis-push-prompt-decline">
          {declineLabel ?? "Not now"}
        </NativeButton>
      </View>
    </NativeSheet>
  );
}
