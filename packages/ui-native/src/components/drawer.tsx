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
 * Slides with Reanimated 4 when the app passes it (`modules.reanimated` on
 * `GenesisModulesProvider`), else with React Native's Animated. Under Reduce
 * Motion it appears in place. The swipe uses React Native's PanResponder in
 * both, so it needs no react-native-gesture-handler.
 *
 * @stability Beta
 */
import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  View,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { cn } from "../utils";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useGenesisModules, type GenesisReanimatedModule } from "../native-modules";

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

const OPEN_MS = 220;
const SETTLE_MS = 180;

export function NativeDrawer(props: NativeDrawerProps) {
  const { reanimated } = useGenesisModules();
  return reanimated ? <ReanimatedDrawer {...props} reanimated={reanimated} /> : <AnimatedDrawer {...props} />;
}

/** Where the panel rests when closed: just off its edge. */
function closedOffset(side: "left" | "right", width: number) {
  return side === "left" ? -width : width;
}

/** A horizontal drag toward the panel's edge: follow it, then dismiss past a third. */
function useSwipe(
  side: "left" | "right",
  drawerWidth: number,
  onOpenChange: (open: boolean) => void,
  follow: (dx: number) => void,
  settle: () => void
) {
  // useMemo (not useRef.current) so the responder always closes over the
  // current `side` / `drawerWidth` / `onOpenChange` values. Otherwise the
  // gesture handler keeps reading mount-time values forever.
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
        onPanResponderMove: (_, g) => follow(side === "left" ? Math.min(0, g.dx) : Math.max(0, g.dx)),
        onPanResponderRelease: (_, g) => {
          const dismiss = side === "left" ? g.dx < -drawerWidth / 3 : g.dx > drawerWidth / 3;
          if (dismiss) onOpenChange(false);
          else settle();
        },
        // Another responder (a horizontal scroll inside, a system gesture)
        // took the drag: put the panel back rather than leave it half open.
        onPanResponderTerminate: () => settle(),
      }),
    [drawerWidth, follow, onOpenChange, settle, side]
  );
}

function ReanimatedDrawer({ reanimated: R, ...props }: NativeDrawerProps & { reanimated: GenesisReanimatedModule }) {
  const { open, side = "left", width } = props;
  const drawerWidth = width ?? Math.min(Dimensions.get("window").width * 0.8, 360);
  const reducedMotion = useReducedMotion();
  const translate = R.useSharedValue(closedOffset(side, drawerWidth));

  useEffect(() => {
    const to = open ? 0 : closedOffset(side, drawerWidth);
    translate.value = reducedMotion ? to : R.withTiming(to, { duration: OPEN_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerWidth, open, reducedMotion, side]);

  // `translate` and `R` are stable for the component's life.
  const follow = useCallback((dx: number) => {
    translate.value = dx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settle = useCallback(() => {
    translate.value = reducedMotion ? 0 : R.withTiming(0, { duration: SETTLE_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);
  const panResponder = useSwipe(side, drawerWidth, props.onOpenChange, follow, settle);
  const animatedStyle = R.useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateX: translate.value }] };
  });

  return <DrawerFrame {...props} side={side} drawerWidth={drawerWidth} Panel={R.default.View} panelStyle={animatedStyle} panHandlers={panResponder.panHandlers} />;
}

function AnimatedDrawer(props: NativeDrawerProps) {
  const { open, side = "left", width } = props;
  const drawerWidth = width ?? Math.min(Dimensions.get("window").width * 0.8, 360);
  const reducedMotion = useReducedMotion();
  const translate = useRef(new Animated.Value(closedOffset(side, drawerWidth))).current;

  useEffect(() => {
    Animated.timing(translate, {
      toValue: open ? 0 : closedOffset(side, drawerWidth),
      duration: reducedMotion ? 0 : OPEN_MS,
      useNativeDriver: true,
    }).start();
  }, [drawerWidth, open, reducedMotion, side, translate]);

  const follow = useCallback((dx: number) => translate.setValue(dx), [translate]);
  const settle = useCallback(
    () =>
      Animated.timing(translate, {
        toValue: 0,
        duration: reducedMotion ? 0 : SETTLE_MS,
        useNativeDriver: true,
      }).start(),
    [reducedMotion, translate]
  );
  const panResponder = useSwipe(side, drawerWidth, props.onOpenChange, follow, settle);

  return (
    <DrawerFrame
      {...props}
      side={side}
      drawerWidth={drawerWidth}
      Panel={Animated.View}
      panelStyle={{ transform: [{ translateX: translate }] }}
      panHandlers={panResponder.panHandlers}
    />
  );
}

function DrawerFrame({
  open,
  onOpenChange,
  side,
  drawerWidth,
  children,
  className,
  testID,
  Panel,
  panelStyle,
  panHandlers,
}: NativeDrawerProps & {
  side: "left" | "right";
  drawerWidth: number;
  Panel: React.ComponentType<any>;
  panelStyle: unknown;
  panHandlers: unknown;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
    >
      {/* The backdrop and the panel are siblings: a tap on the backdrop closes,
          a tap on the panel stays in it. (A full-screen pressable around the
          panel used to swallow every backdrop tap.) */}
      <View style={{ flex: 1 }}>
        <Pressable
          testID={`${testID ?? "native-drawer"}-backdrop`}
          accessibilityRole="button"
          accessibilityLabel="Close drawer"
          className="bg-black/40"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          onPress={() => onOpenChange(false)}
        />
        <Panel
          testID={testID ?? "native-drawer"}
          accessibilityViewIsModal
          {...(panHandlers as object)}
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              [side]: 0,
              width: drawerWidth,
            },
            panelStyle,
          ]}
          className={cn(
            "border-border bg-background p-4 shadow-lg",
            side === "left" ? "border-r" : "border-l",
            className
          )}
        >
          {/* Clear of the status bar and home indicator: the app's insets (a
              Modal has no SafeAreaProvider of its own), none without one. */}
          <View className="flex-1" style={{ paddingTop: insets?.top ?? 0, paddingBottom: insets?.bottom ?? 0 }}>
            {children}
          </View>
        </Panel>
      </View>
    </Modal>
  );
}
