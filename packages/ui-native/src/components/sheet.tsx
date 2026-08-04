/**
 * Sheet / BottomSheet — modal that slides up from the bottom.
 *
 * Use for non-blocking selections, filters, and short flows that benefit
 * from preserving screen context. For blocking confirmations, use
 * <NativeDialog>. For full-screen flows, use a navigation route.
 *
 * Implementation prefers @gorhom/bottom-sheet (gesture-driven, snap
 * points, native feel). Consumers must install @gorhom/bottom-sheet,
 * react-native-gesture-handler, and react-native-reanimated as peer
 * deps; wrap the app root in <GestureHandlerRootView> +
 * <BottomSheetModalProvider>. If the peer is not installed, this
 * primitive falls back to a simple RN Modal with a slide animation —
 * acceptable for samples but not production.
 *
 * @stability Beta
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, View } from "react-native";
import { cn } from "../utils";

export interface NativeSheetProps {
  /** Controlled visibility. */
  open: boolean;
  /** Fired when the user dismisses the sheet (backdrop, gesture, swipe). */
  onOpenChange: (open: boolean) => void;
  /** Snap points (gorhom-style). e.g. ["25%", "50%", "90%"]. */
  snapPoints?: (string | number)[];
  /** Index of initial snap point. Default 0. */
  initialSnapIndex?: number;
  /** Disable dismissing by tapping the backdrop. Default false. */
  disableBackdropDismiss?: boolean;
  children: React.ReactNode;
  testID?: string;
}

// Lazy-load gorhom once at module scope so consumers that don't install it
// can still build / typecheck, and consumers that do install it don't pay
// the require() cost on every render.
type GorhomModule = {
  BottomSheetModal: React.ComponentType<Record<string, unknown>>;
  BottomSheetView: React.ComponentType<Record<string, unknown>>;
  BottomSheetBackdrop: React.ComponentType<Record<string, unknown>>;
};

const GORHOM: GorhomModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@gorhom/bottom-sheet");
    return {
      BottomSheetModal: mod.BottomSheetModal,
      BottomSheetView: mod.BottomSheetView,
      BottomSheetBackdrop: mod.BottomSheetBackdrop,
    };
  } catch {
    return null;
  }
})();

export function NativeSheet({
  open,
  onOpenChange,
  snapPoints = ["50%", "90%"],
  initialSnapIndex = 0,
  disableBackdropDismiss = false,
  children,
  testID,
}: NativeSheetProps) {
  if (GORHOM) {
    return (
      <GorhomSheet
        gorhom={GORHOM}
        open={open}
        onOpenChange={onOpenChange}
        snapPoints={snapPoints}
        initialSnapIndex={initialSnapIndex}
        disableBackdropDismiss={disableBackdropDismiss}
        testID={testID}
      >
        {children}
      </GorhomSheet>
    );
  }
  return (
    <FallbackSheet
      open={open}
      onOpenChange={onOpenChange}
      disableBackdropDismiss={disableBackdropDismiss}
      testID={testID}
    >
      {children}
    </FallbackSheet>
  );
}

interface GorhomSheetProps extends NativeSheetProps {
  gorhom: GorhomModule;
}

type GorhomSheetHandle = { present: () => void; dismiss: () => void };

function GorhomSheet({
  gorhom,
  open,
  onOpenChange,
  snapPoints,
  initialSnapIndex,
  disableBackdropDismiss,
  testID,
  children,
}: GorhomSheetProps) {
  const ref = useRef<GorhomSheetHandle | null>(null);

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  const { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } = gorhom;

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      index={initialSnapIndex}
      onDismiss={() => onOpenChange(false)}
      enablePanDownToClose={!disableBackdropDismiss}
      backdropComponent={(p: Record<string, unknown>) => (
        <BottomSheetBackdrop
          {...p}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior={disableBackdropDismiss ? "none" : "close"}
        />
      )}
    >
      <BottomSheetView testID={testID ?? "native-sheet"}>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

interface FallbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disableBackdropDismiss?: boolean;
  testID?: string;
  children: React.ReactNode;
}

function FallbackSheet({
  open,
  onOpenChange,
  disableBackdropDismiss,
  testID,
  children,
}: FallbackSheetProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
  }, []);
  return (
    <Modal
      visible={open}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable
        className="flex-1 justify-end bg-black/50"
        onPress={() => {
          if (!disableBackdropDismiss) onOpenChange(false);
        }}
      >
        <Pressable onPress={() => {}}>
          <View
            testID={testID ?? "native-sheet"}
            accessibilityViewIsModal
            accessibilityRole="alert"
            className={cn(
              "min-h-[200px] rounded-t-2xl border-t border-border bg-background p-4 shadow-lg"
            )}
          >
            <View className="mb-3 self-center h-1 w-12 rounded-full bg-muted" />
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
