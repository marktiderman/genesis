/**
 * Sheet / BottomSheet — modal that slides up from the bottom.
 *
 * Use for non-blocking selections, filters, and short flows that benefit
 * from preserving screen context. For blocking confirmations, use
 * <NativeDialog>. For full-screen flows, use a navigation route.
 *
 * By default this is React Native's own `Modal`, which needs nothing mounted
 * above it: a page sheet on iOS (the system sheet, swipe down to close) and
 * a bottom panel over a scrim on Android (back button or a tap on the scrim
 * closes it).
 *
 * `@gorhom/bottom-sheet` (snap points, drag between heights) is used only
 * when the app opts in by mounting `<NativeSheetProvider bottomSheet={…}>`
 * (or passing `bottomSheet` to `GenesisNativeApp`), never because the
 * library happens to be installed: it throws on open unless its
 * `BottomSheetModalProvider` is mounted, and it needs gesture-handler's
 * `GestureHandlerRootView` at the root and Reanimated set up.
 * `snapPoints` and `initialSnapIndex` apply only to that path.
 *
 * A sheet that is a screen of its own (a link can open it) belongs in the
 * router instead: an expo-router screen with `presentation: "formSheet"` and
 * `sheetAllowedDetents` (e.g. `[0.5, 1]`) is the system sheet with detents.
 *
 * @stability Beta
 */
import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useThemeRoles } from "../hooks/use-theme-roles";

export interface NativeSheetProps {
  /** Controlled visibility. */
  open: boolean;
  /** Fired when the user dismisses the sheet (backdrop, swipe down, Android back). */
  onOpenChange: (open: boolean) => void;
  /** Snap points, with `@gorhom/bottom-sheet` only (see `NativeSheetProvider`). e.g. ["25%", "50%", "90%"]. */
  snapPoints?: (string | number)[];
  /** Index of initial snap point, with `@gorhom/bottom-sheet` only. Default 0. */
  initialSnapIndex?: number;
  /** Keep the sheet open when the user taps the backdrop, swipes it down or presses Android back. Default false. */
  disableBackdropDismiss?: boolean;
  children: ReactNode;
  testID?: string;
}

type AnyComponent = ComponentType<Record<string, unknown>>;

/**
 * The parts of `@gorhom/bottom-sheet` (v5) the sheet uses. Pass the whole
 * module: `import * as BottomSheet from "@gorhom/bottom-sheet"`.
 */
export interface NativeSheetLibrary {
  BottomSheetModal: unknown;
  BottomSheetView: unknown;
  BottomSheetBackdrop: unknown;
  BottomSheetModalProvider: unknown;
}

const REQUIRED_EXPORTS = ["BottomSheetModal", "BottomSheetView", "BottomSheetBackdrop", "BottomSheetModalProvider"] as const;

const SheetLibraryContext = createContext<NativeSheetLibrary | null>(null);

export interface NativeSheetProviderProps {
  /**
   * `@gorhom/bottom-sheet` v5 (`import * as BottomSheet from "@gorhom/bottom-sheet"`).
   * Read once. The app must also wrap its root in gesture-handler's
   * `GestureHandlerRootView` and set Reanimated up, as the library requires.
   */
  bottomSheet: NativeSheetLibrary;
  children: ReactNode;
}

/**
 * Opts every `NativeSheet` below it into `@gorhom/bottom-sheet` and mounts
 * the library's `BottomSheetModalProvider`. A module missing any export the
 * sheet needs is reported with `console.error` and ignored, so sheets fall
 * back to the native modal instead of crashing on open.
 *
 * @stability Beta
 */
export function NativeSheetProvider({ bottomSheet, children }: NativeSheetProviderProps) {
  // Frozen: a different module later would remount everything below the provider.
  const [library] = useState(() => (isSheetLibrary(bottomSheet) ? bottomSheet : null));
  const [problem] = useState(() => (library ? null : invalidLibraryMessage(bottomSheet)));
  useEffect(() => {
    if (problem) console.error(problem);
  }, [problem]);
  if (!library) return <>{children}</>;
  const Provider = library.BottomSheetModalProvider as ComponentType<{ children: ReactNode }>;
  return (
    <SheetLibraryContext.Provider value={library}>
      <Provider>{children}</Provider>
    </SheetLibraryContext.Provider>
  );
}

function isSheetLibrary(value: unknown): value is NativeSheetLibrary {
  if (!value || typeof value !== "object") return false;
  const mod = value as Record<string, unknown>;
  return REQUIRED_EXPORTS.every((name) => mod[name] != null);
}

function invalidLibraryMessage(value: unknown): string {
  const mod = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const missing = REQUIRED_EXPORTS.filter((name) => mod[name] == null);
  return (
    `NativeSheetProvider: \`bottomSheet\` is missing ${missing.join(", ")}, so sheets use the native modal. ` +
    'Pass the whole module: `import * as BottomSheet from "@gorhom/bottom-sheet"`.'
  );
}

/** @stability Beta */
export function NativeSheet(props: NativeSheetProps) {
  const library = useContext(SheetLibraryContext);
  if (library) return <LibrarySheet library={library} {...props} />;
  return <ModalSheet {...props} />;
}

type SheetHandle = { present: () => void; dismiss: () => void };

function LibrarySheet({
  library,
  open,
  onOpenChange,
  snapPoints = ["50%", "90%"],
  initialSnapIndex = 0,
  disableBackdropDismiss = false,
  testID,
  children,
}: NativeSheetProps & { library: NativeSheetLibrary }) {
  const sheet = useRef<SheetHandle | null>(null);

  // Child refs are attached before this runs, so the first render presents too.
  useEffect(() => {
    if (open) sheet.current?.present();
    else sheet.current?.dismiss();
  }, [open]);

  const BottomSheetModal = library.BottomSheetModal as AnyComponent;
  const BottomSheetView = library.BottomSheetView as AnyComponent;
  const BottomSheetBackdrop = library.BottomSheetBackdrop as AnyComponent;

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={snapPoints}
      index={initialSnapIndex}
      // Also called after a dismiss the app asked for (open went false): only the user's closes are reported.
      onDismiss={() => {
        if (open) onOpenChange(false);
      }}
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
      <BottomSheetView testID={testID ?? "native-sheet"}>{children}</BottomSheetView>
    </BottomSheetModal>
  );
}

/**
 * React Native's `Modal`, which needs no provider. iOS: the system page
 * sheet (`presentationStyle="pageSheet"`); its swipe down only asks through
 * `onRequestClose`, so `disableBackdropDismiss` can keep it up. Android: a
 * transparent modal with a scrim and a panel at the bottom, drawn under the
 * system bars and padded by the bottom inset.
 */
function ModalSheet({ open, onOpenChange, disableBackdropDismiss = false, testID, children }: NativeSheetProps) {
  const reducedMotion = useReducedMotion();
  const roles = useThemeRoles();
  const insets = useContext(SafeAreaInsetsContext);
  const requestClose = () => {
    if (!disableBackdropDismiss) onOpenChange(false);
  };
  const animationType = reducedMotion ? "none" : "slide";
  const id = testID ?? "native-sheet";

  if (Platform.OS === "ios") {
    return (
      <Modal visible={open} animationType={animationType} presentationStyle="pageSheet" onRequestClose={requestClose}>
        <View testID={id} accessibilityViewIsModal style={{ flex: 1, backgroundColor: roles.background }}>
          {children}
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType={animationType}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          testID={`${id}-backdrop`}
          accessibilityRole="button"
          accessibilityLabel="Close"
          disabled={disableBackdropDismiss}
          onPress={requestClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
        />
        <View
          testID={id}
          accessibilityViewIsModal
          style={{
            maxHeight: "90%",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: roles.surface,
            paddingTop: 12,
            paddingBottom: insets?.bottom ?? 0,
          }}
        >
          <View
            style={{ alignSelf: "center", width: 32, height: 4, borderRadius: 2, marginBottom: 8, backgroundColor: roles.tertiaryLabel }}
          />
          {children}
        </View>
      </View>
    </Modal>
  );
}
