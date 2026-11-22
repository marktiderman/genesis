/**
 * @feat:chat
 * Someone typing, the way iMessage shows it: a bubble of three dots on the other side, at the
 * bottom of the thread, under the newest message. In a group the typer's avatar sits beside it,
 * as it does beside their messages. The dots pulse in turn (held still with Reduce Motion), and the
 * bubble reads as the activity line ("Sam is typing…") to VoiceOver and TalkBack.
 */
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { NativeAvatar } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { initials, useChatNative } from "./context";

export interface ChatTypingBubbleProps {
  /** Read out: "Sam is typing…". */
  label: string;
  /** Who is typing (the first, in a group): their avatar shows beside the bubble. */
  userId?: string | null;
  group: boolean;
  reducedMotion: boolean;
  testID: string;
}

const DOT = 8;

export function ChatTypingBubble({ label, userId, group, reducedMotion, testID }: ChatTypingBubbleProps) {
  const colors = useThemeRoles();
  const { person } = useChatNative();
  const typer = userId ? person(userId) : null;
  const dots = useRef([new Animated.Value(0.4), new Animated.Value(0.4), new Animated.Value(0.4)]).current;

  useEffect(() => {
    if (reducedMotion) {
      dots.forEach((d) => d.setValue(0.6));
      return;
    }
    // One loop per dot, each a beat behind the one before (a hold at the low point is the beat).
    const pulses = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(d, { toValue: 0.4, duration: i * 160, useNativeDriver: true }),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.4, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.4, duration: (dots.length - 1 - i) * 160, useNativeDriver: true }),
        ]),
      ),
    );
    pulses.forEach((p) => p.start());
    return () => pulses.forEach((p) => p.stop());
  }, [dots, reducedMotion]);

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "flex-end", paddingTop: 8, paddingBottom: 6, paddingHorizontal: 8 }}
    >
      {group ? (
        <View style={{ width: 40, alignItems: "flex-start" }}>
          <NativeAvatar size={32} src={typer?.avatarUrl ?? null} fallback={initials(typer?.name)} alt={typer?.name} recyclingKey={userId ?? undefined} />
        </View>
      ) : null}
      <View testID={`${testID}-bubble`} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.surface }}>
        {dots.map((opacity, i) => (
          <Animated.View key={i} testID={`${testID}-dot-${i}`} style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.secondaryLabel, opacity }} />
        ))}
      </View>
    </View>
  );
}
