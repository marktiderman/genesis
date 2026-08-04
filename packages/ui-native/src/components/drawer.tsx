/**
 * Drawer — side-anchored panel that slides in from left or right.
 *
 * Use for navigation menus, account switchers, and supplementary
 * controls that should not consume the main canvas. Backdrop dismisses
 * on tap; on supported platforms a horizontal swipe also dismisses.
 *
 * For full-screen modal flows, prefer a navigation route. For a single
 * action confirmation, prefer <NativeDialog>.
 *
 * @stability Beta
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  View,
} from "react-native";
import { cn } from "../utils";

export interface NativeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Side the drawer slides in from. Default "left". */
  side?: "left" | "right";
  /** Drawer width. Default 80% of screen, capped at 360. */
  width?: number;
  children: React.ReactNode;
  className?: string;
  testID?: string;
}

export function NativeDrawer({
  open,
  onOpenChange,
  side = "left",
  width,
  children,
  className,
  testID,
}: NativeDrawerProps) {
  const screen = Dimensions.get("window");
  const drawerWidth = width ?? Math.min(screen.width * 0.8, 360);
  const [reducedMotion, setReducedMotion] = useState(false);
  const translate = useRef(new Animated.Value(side === "left" ? -drawerWidth : drawerWidth)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
  }, []);

  useEffect(() => {
    Animated.timing(translate, {
      toValue: open ? 0 : side === "left" ? -drawerWidth : drawerWidth,
      duration: reducedMotion ? 0 : 220,
      useNativeDriver: true,
    }).start();
  }, [drawerWidth, open, reducedMotion, side, translate]);

  // useMemo (not useRef.current) so the responder always closes over the
  // current `side` / `drawerWidth` / `onOpenChange` values. Otherwise the
  // gesture handler keeps reading mount-time values forever.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
        onPanResponderMove: (_, g) => {
          if (side === "left") {
            translate.setValue(Math.min(0, g.dx));
          } else {
            translate.setValue(Math.max(0, g.dx));
          }
        },
        onPanResponderRelease: (_, g) => {
          const dismiss =
            side === "left" ? g.dx < -drawerWidth / 3 : g.dx > drawerWidth / 3;
          if (dismiss) {
            onOpenChange(false);
          } else {
            Animated.timing(translate, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [drawerWidth, onOpenChange, side, translate]
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable
        accessibilityLabel="Close drawer"
        className="flex-1 bg-black/40"
        onPress={() => onOpenChange(false)}
      >
        <Pressable onPress={() => {}} style={{ flex: 1 }}>
          <Animated.View
            testID={testID ?? "native-drawer"}
            accessibilityViewIsModal
            {...panResponder.panHandlers}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              [side]: 0,
              width: drawerWidth,
              transform: [{ translateX: translate }],
            }}
            className={cn(
              "border-border bg-background p-4 shadow-lg",
              side === "left" ? "border-r" : "border-l",
              className
            )}
          >
            <View className="flex-1">{children}</View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
