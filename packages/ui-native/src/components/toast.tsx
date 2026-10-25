/**
 * Toast / Snackbar — transient feedback message that auto-dismisses.
 *
 * Use for confirmation of completed actions ("Saved.", "Copied to
 * clipboard."). Don't use for errors that need acknowledgment (use
 * <NativeAlert> or <NativeBanner>) or for destructive confirmations
 * (use <NativeDialog>).
 *
 * Wrap the app in <NativeToastProvider>. Components anywhere in the tree
 * call `useToast()` and invoke `toast.show({ title, description, variant })`.
 * Toasts are queued — the next one shows once the current one dismisses
 * (or the user dismisses early).
 *
 * Animates with Reanimated 4 when the app passes it (`modules.reanimated`
 * on `GenesisModulesProvider`), else with React Native's Animated; either
 * way it appears without motion while Reduce Motion is on. A default toast
 * is Liquid Glass on iOS 26 when `modules.glass` (expo-glass-effect) is
 * given and the device can draw it.
 *
 * @stability Beta
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, Text } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { cn } from "../utils";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useThemeMode } from "../hooks/use-theme-mode";
import { useGenesisModules, type GenesisReanimatedModule } from "../native-modules";
import { useLiquidGlass } from "./glass-surface";

export type NativeToastVariant = "default" | "success" | "destructive";

export interface NativeToastOptions {
  /** Bold first line. Required. */
  title: string;
  /** Optional second line for context. */
  description?: string;
  /** Visual variant. Default: "default". */
  variant?: NativeToastVariant;
  /** Auto-dismiss timeout (ms). Default 3500. Set 0 for sticky. */
  duration?: number;
  /** Optional testID forwarded to the toast root. */
  testID?: string;
}

interface ToastInstance extends NativeToastOptions {
  id: number;
}

interface NativeToastContextValue {
  show: (opts: NativeToastOptions) => number;
  dismiss: (id?: number) => void;
}

const ToastContext = createContext<NativeToastContextValue | null>(null);

let nextId = 1;

export interface NativeToastProviderProps {
  children: React.ReactNode;
  /** Position: "top" or "bottom". Default "bottom". */
  position?: "top" | "bottom";
  /** Disable entrance/exit animation. Default false. */
  disableAnimation?: boolean;
}

export function NativeToastProvider({
  children,
  position = "bottom",
  disableAnimation = false,
}: NativeToastProviderProps) {
  const [queue, setQueue] = useState<ToastInstance[]>([]);
  const reducedMotion = useReducedMotion();

  const dismiss = useCallback((id?: number) => {
    setQueue((q) => (id == null ? q.slice(1) : q.filter((t) => t.id !== id)));
  }, []);

  const show = useCallback((opts: NativeToastOptions) => {
    const id = nextId++;
    setQueue((q) => [...q, { ...opts, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const current = queue[0];

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current ? (
        <ToastView
          key={current.id}
          toast={current}
          position={position}
          animate={!disableAnimation && !reducedMotion}
          onDismiss={() => dismiss(current.id)}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

interface ToastViewProps {
  toast: ToastInstance;
  position: "top" | "bottom";
  animate: boolean;
  onDismiss: () => void;
}

type GlassComponent = NonNullable<ReturnType<typeof useLiquidGlass>>;

interface ToastFrameProps extends ToastViewProps {
  /** GlassView when this toast is drawn as Liquid Glass. */
  glass: GlassComponent | null;
}

const ENTER_MS = 180;

// Reanimated 4 when the app passed it, else React Native's Animated. Two
// components rather than one with a branch, so each keeps a fixed hook order.
function ToastView(props: ToastViewProps) {
  const { reanimated } = useGenesisModules();
  const GlassView = useLiquidGlass();
  const glass = (props.toast.variant ?? "default") === "default" ? GlassView : null;
  return reanimated ? (
    <ReanimatedToastView {...props} glass={glass} reanimated={reanimated} />
  ) : (
    <AnimatedToastView {...props} glass={glass} />
  );
}

/**
 * Glass slides in without fading: Liquid Glass doesn't draw under a parent
 * whose opacity is below 1 (Expo's glass-effect docs, after Apple's).
 */
function fades(animate: boolean, glass: GlassComponent | null) {
  return animate && !glass;
}

function useAutoDismiss(toast: ToastInstance, onDismiss: () => void) {
  // Hold the latest onDismiss in a ref so the auto-dismiss timer below does
  // not re-arm on every parent render (the inline `() => dismiss(current.id)`
  // gets a fresh identity each render). Keying the timer effect off
  // toast.duration alone keeps the timer stable for the toast's lifetime.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    const duration = toast.duration ?? 3500;
    if (duration > 0) {
      const t = setTimeout(() => onDismissRef.current(), duration);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [toast.duration]);
}

/**
 * A top toast sits below the safe area's top (the status bar, the Dynamic Island), which the
 * `top-12` class alone doesn't clear on every phone. Without a SafeAreaProvider, the class stays.
 */
function useEdgeStyle(position: "top" | "bottom") {
  const insets = useContext(SafeAreaInsetsContext);
  return position === "top" && insets ? { top: insets.top + 8 } : null;
}

/** Slides in from the edge it sits on. */
function startOffset(position: "top" | "bottom") {
  return position === "top" ? -16 : 16;
}

function ReanimatedToastView({
  toast,
  position,
  animate,
  onDismiss,
  glass,
  reanimated: R,
}: ToastFrameProps & { reanimated: GenesisReanimatedModule }) {
  const fade = fades(animate, glass);
  const opacity = R.useSharedValue(fade ? 0 : 1);
  const offset = R.useSharedValue(animate ? startOffset(position) : 0);
  useAutoDismiss(toast, onDismiss);
  useEffect(() => {
    if (!animate) return;
    const easing = R.Easing.out(R.Easing.cubic);
    if (fade) opacity.value = R.withTiming(1, { duration: ENTER_MS, easing });
    offset.value = R.withTiming(0, { duration: ENTER_MS, easing });
    // Once per toast: each toast mounts under its own key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedStyle = R.useAnimatedStyle(() => {
    "worklet";
    return { opacity: opacity.value, transform: [{ translateY: offset.value }] };
  });
  const AnimatedView = R.default.View;
  const edge = useEdgeStyle(position);
  return (
    <AnimatedView {...regionProps(toast)} className={regionClass(position)} style={edge ? [edge, animatedStyle] : animatedStyle}>
      <ToastBody toast={toast} onDismiss={onDismiss} glass={glass} />
    </AnimatedView>
  );
}

function AnimatedToastView({ toast, position, animate, onDismiss, glass }: ToastFrameProps) {
  const fade = fades(animate, glass);
  const opacity = useRef(new Animated.Value(fade ? 0 : 1)).current;
  const offset = useRef(new Animated.Value(animate ? startOffset(position) : 0)).current;
  useAutoDismiss(toast, onDismiss);
  const edge = useEdgeStyle(position);

  useEffect(() => {
    if (!animate) return;
    const slide = Animated.timing(offset, {
      toValue: 0,
      duration: ENTER_MS,
      useNativeDriver: true,
    });
    const fadeIn = Animated.timing(opacity, {
      toValue: 1,
      duration: ENTER_MS,
      useNativeDriver: true,
    });
    Animated.parallel(fade ? [fadeIn, slide] : [slide]).start();
    // Once per toast: each toast mounts under its own key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      {...regionProps(toast)}
      className={regionClass(position)}
      style={[edge, { opacity, transform: [{ translateY: offset }] }]}
    >
      <ToastBody toast={toast} onDismiss={onDismiss} glass={glass} />
    </Animated.View>
  );
}

function regionProps(toast: ToastInstance) {
  return {
    accessible: true,
    accessibilityRole: "alert",
    accessibilityLiveRegion: "polite" as const,
    accessibilityLabel: toast.description ? `${toast.title}. ${toast.description}` : toast.title,
  };
}

function regionClass(position: "top" | "bottom") {
  return cn("absolute left-4 right-4 items-center", position === "top" ? "top-12 self-center" : "bottom-10 self-center");
}

const variantClasses: Record<NativeToastVariant, string> = {
  default: "bg-foreground",
  success: "bg-primary",
  destructive: "bg-destructive",
};
const textClass: Record<NativeToastVariant, string> = {
  default: "text-background",
  success: "text-primary-foreground",
  destructive: "text-destructive-foreground",
};

/**
 * The toast itself. A default toast is Liquid Glass where it can be drawn,
 * with label-colored text; success and destructive keep their solid color,
 * which carries their meaning.
 */
function ToastBody({ toast, onDismiss, glass: Glass }: { toast: ToastInstance; onDismiss: () => void; glass: GlassComponent | null }) {
  const colorScheme = useThemeMode();
  const variant = toast.variant ?? "default";
  const text = Glass ? "text-foreground" : textClass[variant];
  const testID = toast.testID ?? "native-toast";
  const pressable = (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Dismiss notification"
      accessibilityHint="Dismisses this toast"
      onPress={onDismiss}
      className={cn(
        "min-h-[44px] min-w-[200px] px-4 py-3",
        Glass ? undefined : cn("rounded-lg shadow-lg", variantClasses[variant])
      )}
    >
      <Text className={cn("text-base font-semibold", text)}>{toast.title}</Text>
      {toast.description ? (
        <Text className={cn("mt-0.5 text-sm", text, "opacity-90")}>{toast.description}</Text>
      ) : null}
    </Pressable>
  );
  if (!Glass) return pressable;
  return (
    <Glass
      testID={`${testID}-glass`}
      glassEffectStyle="regular"
      colorScheme={colorScheme}
      isInteractive
      style={{ borderRadius: 16, overflow: "hidden" }}
    >
      {pressable}
    </Glass>
  );
}

export function useToast(): NativeToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToast() must be used inside <NativeToastProvider>. Mount the provider near the root."
    );
  }
  return ctx;
}
