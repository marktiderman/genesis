/**
 * @feat:chat
 * Someone typing, the way a phone's Messages app shows it: a bubble of three dots on the other side, at the
 * bottom of the thread, under the newest message. In a group the typer's avatar sits beside it,
 * as it does beside their messages. The dots pulse in turn (held still with Reduce Motion), and the
 * bubble reads as the activity line ("Sam is typing…") to VoiceOver and TalkBack.
 */
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Platform, View } from "react-native";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { useChatNative } from "./context";
import { ChatFace, useChatColors } from "./messages-look";

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
/** The least time between two "is typing" announcements on iOS. */
const ANNOUNCE_GAP_MS = 4000;

export function ChatTypingBubble({ label, userId, group, reducedMotion, testID }: ChatTypingBubbleProps) {
  const colors = useThemeRoles();
  const chat = useChatColors();
  const { person } = useChatNative();
  const typer = userId ? person(userId) : null;
  const dots = useRef([new Animated.Value(0.4), new Animated.Value(0.4), new Animated.Value(0.4)]).current;

  // iOS has no live regions: VoiceOver hears who is typing when it changes, at most every few seconds.
  const lastSaid = useRef<{ label: string; at: number } | null>(null);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const now = Date.now();
    const last = lastSaid.current;
    if (last && (last.label === label || now - last.at < ANNOUNCE_GAP_MS)) return;
    lastSaid.current = { label, at: now };
    (AccessibilityInfo as { announceForAccessibility?: (t: string) => void }).announceForAccessibility?.(label);
  }, [label]);

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
      style={{ flexDirection: "row", alignItems: "flex-end", paddingTop: 10, paddingBottom: 6, paddingHorizontal: 4 }}
    >
      {group ? (
        <View style={{ width: 36, alignItems: "flex-start" }}>
          <ChatFace size={28} name={typer?.name} src={typer?.avatarUrl ?? null} recyclingKey={userId ?? undefined} />
        </View>
      ) : null}
      <View testID={`${testID}-bubble`} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: chat.roles.received }}>
        {dots.map((opacity, i) => (
          <Animated.View key={i} testID={`${testID}-dot-${i}`} style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.secondaryLabel, opacity }} />
        ))}
      </View>
    </View>
  );
}
