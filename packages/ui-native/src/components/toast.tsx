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
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  View,
} from "react-native";
import { cn } from "../utils";

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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReducedMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v) => mounted && setReducedMotion(v)
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

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

function ToastView({ toast, position, animate, onDismiss }: ToastViewProps) {
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const offset = useRef(new Animated.Value(animate ? 16 : 0)).current;

  // Hold the latest onDismiss in a ref so the auto-dismiss timer below does
  // not re-arm on every parent render (the inline `() => dismiss(current.id)`
  // gets a fresh identity each render). Keying the timer effect off
  // toast.duration alone keeps the timer stable for the toast's lifetime.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (animate) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(offset, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }

    const duration = toast.duration ?? 3500;
    if (duration > 0) {
      const t = setTimeout(() => onDismissRef.current(), duration);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [animate, offset, opacity, toast.duration]);

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

  const variant = toast.variant ?? "default";
  const positionClass =
    position === "top" ? "top-12 self-center" : "bottom-10 self-center";

  return (
    <Animated.View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        toast.description ? `${toast.title}. ${toast.description}` : toast.title
      }
      className={cn(
        "absolute left-4 right-4 items-center",
        positionClass
      )}
      style={{ opacity, transform: [{ translateY: offset }] }}
    >
      <Pressable
        testID={toast.testID ?? "native-toast"}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        accessibilityHint="Dismisses this toast"
        onPress={onDismiss}
        className={cn(
          "min-h-[44px] min-w-[200px] rounded-lg px-4 py-3 shadow-lg",
          variantClasses[variant]
        )}
      >
        <Text className={cn("text-base font-semibold", textClass[variant])}>
          {toast.title}
        </Text>
        {toast.description ? (
          <Text className={cn("mt-0.5 text-sm", textClass[variant], "opacity-90")}>
            {toast.description}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
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
