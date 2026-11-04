/**
 * NativeSwipeRow — a row with actions behind a swipe: Archive to one side,
 * Delete to the other (each action's `side`, trailing by default).
 *
 * The gesture is the app's `GenesisModules.swipeable` (react-native-gesture-
 * handler's `ReanimatedSwipeable`, an optional peer). Without it, the row draws
 * as it is, so an action must always be reachable another way too: `InboxPage`
 * puts them in the accessibility actions and on long press. The buttons behind
 * the row are hidden from VoiceOver for that reason (a screen reader doesn't
 * swipe), and a swipe that opens taps `medium` through `useHaptics`.
 *
 * @stability Beta
 */
import { useRef, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { InboxSwipeAction } from "@marktiderman/genesis-core/conversation";
import { useHaptics } from "../hooks/use-haptics";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules } from "../native-modules";
import { NativeText } from "./text";

export interface NativeSwipeRowProps {
  actions: readonly InboxSwipeAction[];
  children?: ReactNode;
  testID?: string;
}

/** A button's width behind the row: room for a short label. */
const ACTION_WIDTH = 80;

export function NativeSwipeRow({ actions, children, testID = "swipe-row" }: NativeSwipeRowProps) {
  const { swipeable: Swipeable } = useGenesisModules();
  const colors = useThemeRoles();
  const play = useHaptics();
  const swipe = useRef<{ close?: () => void } | null>(null);
  if (!Swipeable || actions.length === 0) return <>{children}</>;

  const leading = actions.filter((a) => a.side === "leading");
  const trailing = actions.filter((a) => a.side !== "leading");
  const group = (list: readonly InboxSwipeAction[]) => () => (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row" }}>
      {list.map((action) => (
        <Pressable
          key={action.id}
          testID={`${testID}-action-${action.id}`}
          onPress={() => {
            swipe.current?.close?.();
            action.onPress();
          }}
          style={{ width: ACTION_WIDTH, alignItems: "center", justifyContent: "center", backgroundColor: action.destructive ? colors.destructive : colors.tint }}
        >
          <NativeText className={action.destructive ? "text-destructive-foreground" : "text-primary-foreground"} preset="label">
            {action.label}
          </NativeText>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Swipeable
      ref={swipe}
      testID={testID}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => play("medium")}
      renderLeftActions={leading.length ? group(leading) : undefined}
      renderRightActions={trailing.length ? group(trailing) : undefined}
    >
      {children}
    </Swipeable>
  );
}
