/**
 * @feat:chat
 * Every message's time, on demand, as iMessage shows it: drag the thread left and the bubbles
 * slide over, each one's time appearing at the trailing edge; let go and they slide back. The
 * last message of a run keeps its time under it all the time. VoiceOver already reads each time
 * in the bubble's label, so the revealed times are hidden from it.
 *
 * One `Animated.Value` for the whole thread (how far it is pulled, 0 to `TIME_REVEAL_WIDTH`),
 * given to the rows through context, so a drag re-renders nothing: each row's transform follows it
 * on the native driver. Reduce Motion: it still follows the finger (that's direct manipulation),
 * and snaps back on release instead of springing.
 */
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { Animated, PanResponder, View, type GestureResponderHandlers } from "react-native";
import { NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";

/** How far the bubbles slide to show the times, in points. */
export const TIME_REVEAL_WIDTH = 64;

/** A horizontal move counts as the reveal once it is this far left and mostly sideways. */
export function startsTimeReveal(dx: number, dy: number): boolean {
  return dx < -12 && Math.abs(dx) > Math.abs(dy) * 2;
}

/** How far the thread is pulled for a drag of `dx` (negative is left). */
export function timeRevealFor(dx: number): number {
  return Math.max(0, Math.min(TIME_REVEAL_WIDTH, -dx));
}

const TimesContext = createContext<Animated.Value | null>(null);

/** The pan that pulls the times in, and the value rows read. Put `panHandlers` on the view around the list. */
export function useTimeReveal(reducedMotion: boolean): { value: Animated.Value; panHandlers: GestureResponderHandlers } {
  const value = useRef(new Animated.Value(0)).current;
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;
  const responder = useMemo(() => {
    const back = () => {
      if (reduced.current) value.setValue(0);
      else Animated.spring(value, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => startsTimeReveal(g.dx, g.dy),
      onPanResponderMove: (_e, g) => value.setValue(timeRevealFor(g.dx)),
      onPanResponderRelease: back,
      onPanResponderTerminate: back,
    });
  }, [value]);
  return { value, panHandlers: responder.panHandlers };
}

export function ChatTimesProvider({ value, children }: { value: Animated.Value; children: ReactNode }) {
  return <TimesContext.Provider value={value}>{children}</TimesContext.Provider>;
}

/** A row that slides with the reveal and shows its time at the trailing edge. Without a provider, a plain view. */
export function TimeRevealRow({ time, testID, children }: { time: string; testID: string; children: ReactNode }) {
  const reveal = useContext(TimesContext);
  const colors = useThemeRoles();
  const styles = useMemo(
    () =>
      reveal
        ? {
            row: { transform: [{ translateX: reveal.interpolate({ inputRange: [0, TIME_REVEAL_WIDTH], outputRange: [0, -TIME_REVEAL_WIDTH], extrapolate: "clamp" }) }] },
            time: { opacity: reveal.interpolate({ inputRange: [0, TIME_REVEAL_WIDTH], outputRange: [0, 1], extrapolate: "clamp" }) },
          }
        : null,
    [reveal],
  );
  if (!styles) return <View>{children}</View>;
  return (
    <Animated.View style={styles.row}>
      {children}
      <Animated.View
        testID={`${testID}-time-reveal`}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ position: "absolute", top: 0, bottom: 0, right: -TIME_REVEAL_WIDTH, width: TIME_REVEAL_WIDTH, alignItems: "center", justifyContent: "center" }, styles.time]}
      >
        {/* Shrinks to fit the column at the largest text sizes, rather than clip. */}
        <NativeText preset="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: colors.tertiaryLabel }}>
          {time}
        </NativeText>
      </Animated.View>
    </Animated.View>
  );
}
