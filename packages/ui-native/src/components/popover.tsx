/**
 * Popover — supplemental content anchored to a trigger.
 *
 * Use for inline supplemental info, picker UIs, and micro-menus that
 * don't warrant a Sheet or Dialog. Tap-outside dismisses. The popover
 * positions above or below the anchor based on available space.
 *
 * Compose: <NativePopover><NativePopoverTrigger /><NativePopoverContent />
 * </NativePopover>. Only one popover is open per <NativePopover>.
 *
 * @stability Beta
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, Pressable, View } from "react-native";
import { cn } from "../utils";

// React Native's View instance type — uses .measureInWindow().
type ViewHandle = {
  measureInWindow: (
    cb: (x: number, y: number, width: number, height: number) => void
  ) => void;
};

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  anchorRef: React.RefObject<ViewHandle | null>;
  anchorRect: AnchorRect | null;
  measureAnchor: () => void;
}

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

export interface NativePopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function NativePopover({
  open: controlled,
  defaultOpen,
  onOpenChange,
  children,
}: NativePopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const open = controlled ?? uncontrolled;
  const anchorRef = useRef<ViewHandle | null>(null);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlled === undefined) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );

  const measureAnchor = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchorRect({ x, y, width, height });
    });
  }, []);

  const value = useMemo<PopoverContextValue>(
    () => ({ open, setOpen, anchorRef, anchorRect, measureAnchor }),
    [open, setOpen, anchorRect, measureAnchor]
  );

  return (
    <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
  );
}

export interface NativePopoverTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
  testID?: string;
}

export function NativePopoverTrigger({
  children,
  testID,
}: NativePopoverTriggerProps) {
  const ctx = useContext(PopoverContext);
  if (!ctx)
    throw new Error("NativePopoverTrigger must be used inside <NativePopover>.");

  // We attach the ref to a wrapping View — Pressable's ref shape varies
  // across RN versions; View's measureInWindow is stable everywhere.
  return (
    <View
      ref={(instance) => {
        ctx.anchorRef.current = (instance as unknown as ViewHandle | null) ?? null;
      }}
      collapsable={false}
    >
      <Pressable
        testID={testID ?? "native-popover-trigger"}
        accessibilityRole="button"
        accessibilityHint="Opens a popover"
        onPress={() => {
          ctx.measureAnchor();
          ctx.setOpen(!ctx.open);
        }}
        className="min-h-[44px] min-w-[44px] items-center justify-center"
      >
        {children}
      </Pressable>
    </View>
  );
}

export interface NativePopoverContentProps {
  className?: string;
  children: React.ReactNode;
  /** Force a side ("top"|"bottom"). Default: auto-resolve. */
  side?: "top" | "bottom";
  /** Pixel offset from the anchor edge. Default 8. */
  sideOffset?: number;
  testID?: string;
}

export function NativePopoverContent({
  className,
  children,
  side,
  sideOffset = 8,
  testID,
}: NativePopoverContentProps) {
  const ctx = useContext(PopoverContext);
  if (!ctx)
    throw new Error("NativePopoverContent must be used inside <NativePopover>.");
  if (!ctx.open || !ctx.anchorRect) return null;

  const { x, y, width, height } = ctx.anchorRect;
  // Resolve side: prefer below; flip when we'd run off the bottom (heuristic 600px).
  const resolvedSide: "top" | "bottom" =
    side ?? (y > 500 ? "top" : "bottom");

  const computedTop =
    resolvedSide === "bottom"
      ? y + height + sideOffset
      : Math.max(0, y - sideOffset - 8);

  return (
    <Modal
      visible={ctx.open}
      transparent
      animationType="fade"
      onRequestClose={() => ctx.setOpen(false)}
    >
      <Pressable
        accessibilityLabel="Close popover"
        className="flex-1"
        onPress={() => ctx.setOpen(false)}
      >
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: x,
            top: computedTop,
            minWidth: width,
          }}
        >
          <Pressable onPress={() => {}}>
            <View
              testID={testID ?? "native-popover-content"}
              accessibilityViewIsModal
              className={cn(
                "max-w-[280px] rounded-md border border-border bg-popover p-3 shadow-md",
                className
              )}
            >
              {children}
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
